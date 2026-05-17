/**
 * ClawBoy Feedback Worker
 * -----------------------
 * Accepts JSON `POST /v1/feedback` from the ClawBoy app and creates a
 * GitHub Issue on `kjswalls/clawboy-feedback` using a fine-grained PAT.
 * No GitHub credentials live in the app.
 *
 * Security posture (per repo `.cursorrules`):
 *  - Body is rejected if it looks like it leaks gateway URLs or auth tokens
 *    (defence-in-depth — the app side already strips these).
 *  - Per-IP rate limiting via Workers KV (15/h, 75/d).
 *  - clientNonce idempotency for 24h to absorb duplicate submits.
 *  - Fine-grained PAT lives in CF secrets only; scoped to Issues:write on
 *    one repo (`kjswalls/clawboy-feedback`) and nothing else.
 */
export type { Env } from './types';
import type { Env, ErrorResponse, FeedbackRequest, SuccessResponse } from './types';
import { serveAttachment } from './attachmentProxy';
import { json, cors } from './http';
import { validate, findLeak } from './validation';
import { timingSafeEqual, checkRateLimit } from './rateLimit';
import { putOrUpdateFile, createIssue } from './github';

const NONCE_TTL_SECONDS = 24 * 60 * 60;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') {
        return cors(env, new Response(null, { status: 204 }));
      }

      if (url.pathname === '/healthz') {
        return cors(env, json({ ok: true }, 200));
      }

      // Screenshot proxy — serves private-repo attachments via the worker so
      // GH's short-lived signed URLs are never embedded in issue bodies.
      const attachmentMatch = url.pathname.match(/^\/v1\/attachments\/([A-Za-z0-9_-]{8,128})\/([0-2])\.jpg$/);
      if (attachmentMatch) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
        }
        return serveAttachment(env, ctx, attachmentMatch[1], attachmentMatch[2]);
      }

      if (url.pathname !== '/v1/feedback') {
        return cors(env, json({ ok: false, error: 'method_not_allowed' } satisfies ErrorResponse, 404));
      }

      if (request.method !== 'POST') {
        return cors(
          env,
          json({ ok: false, error: 'method_not_allowed' } satisfies ErrorResponse, 405, {
            Allow: 'POST, OPTIONS',
          }),
        );
      }

      return cors(env, await handleFeedback(request, env));
    } catch (err) {
      console.error('worker_unhandled', err instanceof Error ? err.message : String(err));
      return cors(env, json({ ok: false, error: 'server_error' } satisfies ErrorResponse, 500));
    }
  },
} satisfies ExportedHandler<Env>;

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' } satisfies ErrorResponse, 400);
  }

  const validation = validate(payload);
  if (!validation.ok) {
    return json(
      { ok: false, error: 'validation', message: validation.message } satisfies ErrorResponse,
      400,
    );
  }
  const req: FeedbackRequest = validation.value;

  const leakField = findLeak(req.title, req.body, req.contact);
  if (leakField !== null) {
    return json(
      {
        ok: false,
        error: 'leak_blocked',
        message: `Please remove URLs / tokens from the ${leakField} before submitting.`,
      } satisfies ErrorResponse,
      400,
    );
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';

  // Idempotency: replay the prior issueUrl if we've already created one for
  // this clientNonce in the last 24h. Has to come before the rate-limit check
  // so retries don't burn a slot.
  const existing = await env.FEEDBACK_KV.get(`nonce:${req.clientNonce}`);
  if (existing != null) {
    try {
      const parsed = JSON.parse(existing) as { issueUrl: string; issueNumber: number };
      return json(
        { ok: true, issueUrl: parsed.issueUrl, issueNumber: parsed.issueNumber } satisfies SuccessResponse,
        200,
      );
    } catch {
      // Malformed cached record — fall through and retry.
    }
  }

  // Dev bypass: skip rate limiting when the request presents a valid shared secret.
  const devToken = request.headers.get('x-feedback-dev-token');
  const bypassRateLimit =
    typeof env.DEV_BYPASS_TOKEN === 'string' &&
    env.DEV_BYPASS_TOKEN.length >= 16 &&
    devToken != null &&
    timingSafeEqual(devToken, env.DEV_BYPASS_TOKEN);

  if (!bypassRateLimit) {
    const limit = await checkRateLimit(env, ip);
    if (!limit.ok) {
      return json(
        {
          ok: false,
          error: 'rate_limited',
          message: 'Too many submissions, please slow down.',
          retryAfter: limit.retryAfter,
        } satisfies ErrorResponse,
        429,
        { 'Retry-After': String(limit.retryAfter) },
      );
    }
  }

  // Upload screenshots to the repo and collect proxy URLs.
  // We use the worker's own origin (not GH's short-lived signed download_url)
  // so the URLs in issue bodies never expire.
  const origin = new URL(request.url).origin;
  const screenshotUrls: string[] = [];
  if (req.screenshots && req.screenshots.length > 0) {
    const branch = env.GITHUB_DEFAULT_BRANCH ?? 'main';
    for (let i = 0; i < req.screenshots.length; i++) {
      const shot = req.screenshots[i];
      const path = `feedback-attachments/${req.clientNonce}/${i}.jpg`;
      const upload = await putOrUpdateFile(env, path, shot.base64, branch);
      if (!upload.ok) {
        return json(
          {
            ok: false,
            error: 'upstream_github',
            message: upload.message,
          } satisfies ErrorResponse,
          502,
        );
      }
      screenshotUrls.push(`${origin}/v1/attachments/${encodeURIComponent(req.clientNonce)}/${i}.jpg`);
    }
  }

  const issue = await createIssue(env, req, screenshotUrls);
  if (!issue.ok) {
    return json(
      {
        ok: false,
        error: 'upstream_github',
        message: issue.message,
      } satisfies ErrorResponse,
      502,
    );
  }

  await env.FEEDBACK_KV.put(
    `nonce:${req.clientNonce}`,
    JSON.stringify({ issueUrl: issue.issueUrl, issueNumber: issue.issueNumber }),
    { expirationTtl: NONCE_TTL_SECONDS },
  );

  return json(
    { ok: true, issueUrl: issue.issueUrl, issueNumber: issue.issueNumber } satisfies SuccessResponse,
    200,
  );
}
