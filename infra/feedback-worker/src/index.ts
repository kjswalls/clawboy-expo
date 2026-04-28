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
 *  - Per-IP rate limiting via Workers KV (5/h, 30/d).
 *  - clientNonce idempotency for 24h to absorb duplicate submits.
 *  - Fine-grained PAT lives in CF secrets only; scoped to Issues:write on
 *    one repo (`kjswalls/clawboy-feedback`) and nothing else.
 */
export interface Env {
  // Secrets (wrangler secret put)
  GITHUB_PAT: string;
  ALLOWED_ORIGINS?: string;

  // Public vars (wrangler.toml [vars])
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  APP_LABEL: string;
  /** Default branch for screenshot uploads. Defaults to "main". */
  GITHUB_DEFAULT_BRANCH?: string;

  // KV bindings
  FEEDBACK_KV: KVNamespace;
}

// ── Public types ────────────────────────────────────────────────────────────

type FeedbackKind = 'bug' | 'feature';

interface FeedbackDiagnostics {
  appVersion?: string;
  buildNumber?: string;
  updateId?: string | null;
  platform?: 'ios' | 'android' | 'web';
  osName?: string | null;
  osVersion?: string | null;
  deviceModel?: string | null;
  deviceBrand?: string | null;
  deviceManufacturer?: string | null;
  deviceYearClass?: number | null;
  locale?: string | null;
  timeZone?: string | null;
}

interface FeedbackScreenshot {
  mimeType: 'image/jpeg';
  base64: string;
}

interface FeedbackRequest {
  kind: FeedbackKind;
  title: string;
  body: string;
  contact?: string;
  diagnostics?: FeedbackDiagnostics;
  screenshots?: FeedbackScreenshot[];
  clientNonce: string;
}

interface SuccessResponse {
  ok: true;
  issueUrl: string;
  issueNumber: number;
}

interface ErrorResponse {
  ok: false;
  error:
    | 'method_not_allowed'
    | 'invalid_json'
    | 'validation'
    | 'leak_blocked'
    | 'rate_limited'
    | 'upstream_github'
    | 'server_error';
  message?: string;
  retryAfter?: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const TITLE_MIN = 4;
const TITLE_MAX = 120;
const BODY_MIN = 10;
const BODY_MAX = 8000;
const CONTACT_MAX = 200;

const SCREENSHOT_MAX_COUNT = 3;
// 1.3 MiB per screenshot (generous ceiling — app already compresses to 1.2 MiB)
const SCREENSHOT_MAX_DECODED_BYTES = Math.ceil(1.3 * 1024 * 1024);
// 4 MiB total across all screenshots
const SCREENSHOT_TOTAL_DECODED_BYTES = 4 * 1024 * 1024;

const RATE_LIMIT_HOUR = 5;
const RATE_LIMIT_DAY = 30;
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;

const NONCE_TTL_SECONDS = 24 * 60 * 60;

// Patterns we block in user-supplied title/body to avoid leaking gateway URLs
// or auth tokens into a public issue.
const LEAK_PATTERNS: RegExp[] = [
  /\bwss?:\/\//i,
  /\bhttps?:\/\/\S+/i,
  /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/i,
  /\btoken\s*[=:]\s*\S{8,}/i,
  // JWT-shaped strings: three base64url segments separated by dots
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
];

// ── Worker entrypoint ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') {
        return cors(env, new Response(null, { status: 204 }));
      }

      if (url.pathname === '/healthz') {
        return cors(env, json({ ok: true }, 200));
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

// ── Request pipeline ────────────────────────────────────────────────────────

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
  const req = validation.value;

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

  // Upload screenshots to the repo and collect public download URLs.
  const screenshotUrls: string[] = [];
  if (req.screenshots && req.screenshots.length > 0) {
    for (let i = 0; i < req.screenshots.length; i++) {
      const shot = req.screenshots[i];
      const branch = env.GITHUB_DEFAULT_BRANCH ?? 'main';
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
      screenshotUrls.push(upload.downloadUrl);
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

// ── Validation ──────────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true; value: FeedbackRequest }
  | { ok: false; message: string };

function validate(input: unknown): ValidationResult {
  if (input === null || typeof input !== 'object') {
    return { ok: false, message: 'Body must be a JSON object.' };
  }
  const o = input as Record<string, unknown>;

  if (o.kind !== 'bug' && o.kind !== 'feature') {
    return { ok: false, message: '`kind` must be "bug" or "feature".' };
  }

  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return { ok: false, message: `\`title\` must be ${TITLE_MIN}–${TITLE_MAX} characters.` };
  }

  const body = typeof o.body === 'string' ? o.body.trim() : '';
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    return { ok: false, message: `\`body\` must be ${BODY_MIN}–${BODY_MAX} characters.` };
  }

  let contact: string | undefined;
  if (o.contact != null) {
    if (typeof o.contact !== 'string') {
      return { ok: false, message: '`contact` must be a string.' };
    }
    const trimmed = o.contact.trim();
    if (trimmed.length > CONTACT_MAX) {
      return { ok: false, message: `\`contact\` must be ≤${CONTACT_MAX} characters.` };
    }
    contact = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof o.clientNonce !== 'string' || o.clientNonce.length < 8 || o.clientNonce.length > 128) {
    return { ok: false, message: '`clientNonce` must be a string of 8–128 characters.' };
  }

  let diagnostics: FeedbackDiagnostics | undefined;
  if (o.diagnostics != null) {
    if (typeof o.diagnostics !== 'object') {
      return { ok: false, message: '`diagnostics` must be an object.' };
    }
    diagnostics = sanitizeDiagnostics(o.diagnostics as Record<string, unknown>);
  }

  let screenshots: FeedbackScreenshot[] | undefined;
  if (o.screenshots != null) {
    const screenshotsResult = validateScreenshots(o.screenshots);
    if (!screenshotsResult.ok) {
      return { ok: false, message: screenshotsResult.message };
    }
    screenshots = screenshotsResult.value;
  }

  return {
    ok: true,
    value: {
      kind: o.kind,
      title,
      body,
      contact,
      clientNonce: o.clientNonce,
      diagnostics,
      screenshots,
    },
  };
}

type ScreenshotsValidationResult =
  | { ok: true; value: FeedbackScreenshot[] }
  | { ok: false; message: string };

function validateScreenshots(input: unknown): ScreenshotsValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, message: '`screenshots` must be an array.' };
  }
  if (input.length > SCREENSHOT_MAX_COUNT) {
    return { ok: false, message: `Maximum ${SCREENSHOT_MAX_COUNT} screenshots allowed.` };
  }

  let totalBytes = 0;
  const validated: FeedbackScreenshot[] = [];

  for (let i = 0; i < input.length; i++) {
    const item = input[i];
    if (item === null || typeof item !== 'object') {
      return { ok: false, message: `screenshots[${i}] must be an object.` };
    }
    const s = item as Record<string, unknown>;

    if (s['mimeType'] !== 'image/jpeg') {
      return { ok: false, message: `screenshots[${i}].mimeType must be "image/jpeg".` };
    }
    if (typeof s['base64'] !== 'string' || s['base64'].length === 0) {
      return { ok: false, message: `screenshots[${i}].base64 must be a non-empty string.` };
    }

    // Reject base64 that contains characters outside the standard alphabet —
    // a quick sanity check before we try to decode.
    if (!/^[A-Za-z0-9+/]+=*$/.test(s['base64'])) {
      return { ok: false, message: `screenshots[${i}].base64 contains invalid characters.` };
    }

    const decodedBytes = base64DecodedSize(s['base64']);
    if (decodedBytes > SCREENSHOT_MAX_DECODED_BYTES) {
      return { ok: false, message: `screenshots[${i}] exceeds the per-image size limit.` };
    }
    totalBytes += decodedBytes;
    if (totalBytes > SCREENSHOT_TOTAL_DECODED_BYTES) {
      return { ok: false, message: 'Total screenshot size exceeds the limit.' };
    }

    // Verify magic bytes — never trust the client-supplied mimeType alone.
    if (!verifyJpegMagicBytes(s['base64'])) {
      return { ok: false, message: `screenshots[${i}] does not appear to be a valid JPEG image.` };
    }

    validated.push({ mimeType: 'image/jpeg', base64: s['base64'] });
  }

  return { ok: true, value: validated };
}

function base64DecodedSize(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Checks that the first bytes of the base64-encoded content match the JPEG
 * magic bytes (FF D8 FF). Only decodes the first 4 bytes.
 */
function verifyJpegMagicBytes(b64: string): boolean {
  try {
    // 4 bytes needs ceil(4/3)*4 = 8 base64 chars; pad to multiple of 4.
    const prefix = b64.slice(0, 8).padEnd(8, '=');
    const raw = atob(prefix);
    return raw.charCodeAt(0) === 0xFF && raw.charCodeAt(1) === 0xD8 && raw.charCodeAt(2) === 0xFF;
  } catch {
    return false;
  }
}

function sanitizeDiagnostics(d: Record<string, unknown>): FeedbackDiagnostics {
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : undefined;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const platform = ((): FeedbackDiagnostics['platform'] => {
    const p = d['platform'];
    return p === 'ios' || p === 'android' || p === 'web' ? p : undefined;
  })();

  return {
    appVersion: str(d['appVersion']),
    buildNumber: str(d['buildNumber']),
    updateId: str(d['updateId']) ?? null,
    platform,
    osName: str(d['osName']) ?? null,
    osVersion: str(d['osVersion']) ?? null,
    deviceModel: str(d['deviceModel']) ?? null,
    deviceBrand: str(d['deviceBrand']) ?? null,
    deviceManufacturer: str(d['deviceManufacturer']) ?? null,
    deviceYearClass: num(d['deviceYearClass']) ?? null,
    locale: str(d['locale']) ?? null,
    timeZone: str(d['timeZone']) ?? null,
  };
}

function findLeak(...fields: Array<string | undefined>): string | null {
  const labels = ['title', 'body', 'contact'];
  for (let i = 0; i < fields.length; i++) {
    const value = fields[i];
    if (typeof value !== 'string' || value.length === 0) continue;
    for (const re of LEAK_PATTERNS) {
      if (re.test(value)) return labels[i] ?? 'field';
    }
  }
  return null;
}

// ── Rate limiting (Workers KV) ──────────────────────────────────────────────

interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
}

async function checkRateLimit(env: Env, ip: string): Promise<RateLimitResult> {
  // Two windows: 5/hour and 30/day. KV is eventually consistent — fine for a
  // human-driven feedback form. We bump the counters even if a downstream
  // step fails; that's an acceptable conservative bias.
  const hourKey = `rl:ip:${ip}:h`;
  const dayKey = `rl:ip:${ip}:d`;

  const [hourRaw, dayRaw] = await Promise.all([env.FEEDBACK_KV.get(hourKey), env.FEEDBACK_KV.get(dayKey)]);
  const hourCount = parseInt(hourRaw ?? '0', 10) || 0;
  const dayCount = parseInt(dayRaw ?? '0', 10) || 0;

  if (hourCount >= RATE_LIMIT_HOUR) {
    return { ok: false, retryAfter: HOUR_SECONDS };
  }
  if (dayCount >= RATE_LIMIT_DAY) {
    return { ok: false, retryAfter: DAY_SECONDS };
  }

  await Promise.all([
    env.FEEDBACK_KV.put(hourKey, String(hourCount + 1), { expirationTtl: HOUR_SECONDS }),
    env.FEEDBACK_KV.put(dayKey, String(dayCount + 1), { expirationTtl: DAY_SECONDS }),
  ]);
  return { ok: true, retryAfter: 0 };
}

// ── Screenshot upload ───────────────────────────────────────────────────────

interface UploadResult {
  ok: true;
  downloadUrl: string;
}
interface UploadError {
  ok: false;
  message: string;
}

/**
 * Uploads a base64 file to the GitHub repo contents API. If the file already
 * exists at that path (e.g. a retry after a transient failure), fetches its
 * current SHA and updates it in place so the submission succeeds cleanly.
 */
async function putOrUpdateFile(
  env: Env,
  path: string,
  contentBase64: string,
  branch: string,
): Promise<UploadResult | UploadError> {
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${encodeURIComponent(path)}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_PAT}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'clawboy-feedback-worker',
  };

  const tryPut = async (sha?: string): Promise<UploadResult | UploadError> => {
    const body: Record<string, string> = {
      message: `feedback attachment`,
      content: contentBase64,
      branch,
    };
    if (sha) body['sha'] = sha;

    const res = await fetch(apiBase, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (res.ok) {
      const data = (await res.json()) as { content?: { download_url?: string } };
      const downloadUrl = data.content?.download_url;
      if (!downloadUrl) {
        return { ok: false, message: 'GitHub did not return a download URL for the uploaded screenshot.' };
      }
      return { ok: true, downloadUrl };
    }
    const text = await safeText(res);
    return { ok: false, message: `GitHub contents API ${res.status}: ${text.slice(0, 200)}` };
  };

  const first = await tryPut();
  if (first.ok) return first;

  // 409 or 422 usually means the file already exists (retry scenario).
  // GET the existing file to retrieve its SHA, then update.
  const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { headers });
  if (!getRes.ok) {
    return first; // Return the original error if we can't resolve the conflict.
  }
  const existing = (await getRes.json()) as { sha?: string };
  if (typeof existing.sha !== 'string') return first;

  return tryPut(existing.sha);
}

// ── Issue creation ──────────────────────────────────────────────────────────

interface IssueResult {
  ok: true;
  issueUrl: string;
  issueNumber: number;
}
interface IssueError {
  ok: false;
  message: string;
}

async function createIssue(env: Env, req: FeedbackRequest, screenshotUrls: string[]): Promise<IssueResult | IssueError> {
  const titlePrefix = req.kind === 'bug' ? '[Bug]' : '[Feature]';
  const issueTitle = `${titlePrefix} ${req.title}`;
  const issueBody = renderIssueBody(req, screenshotUrls);
  const labels = [env.APP_LABEL, req.kind === 'bug' ? 'bug' : 'enhancement', 'needs-triage'];

  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'clawboy-feedback-worker',
      },
      body: JSON.stringify({ title: issueTitle, body: issueBody, labels }),
    },
  );

  if (!res.ok) {
    const text = await safeText(res);
    return { ok: false, message: `GitHub API ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { html_url: string; number: number };
  return { ok: true, issueUrl: data.html_url, issueNumber: data.number };
}

function renderIssueBody(req: FeedbackRequest, screenshotUrls: string[]): string {
  const lines: string[] = [];
  lines.push(req.body.trim());
  lines.push('');

  if (screenshotUrls.length > 0) {
    lines.push('### Screenshots');
    lines.push('');
    for (let i = 0; i < screenshotUrls.length; i++) {
      lines.push(`![Screenshot ${i + 1}](${screenshotUrls[i]})`);
    }
    lines.push('');
  }

  if (req.diagnostics) {
    lines.push('<details><summary>Diagnostics</summary>');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    const d = req.diagnostics;
    const row = (label: string, value: string | number | null | undefined): void => {
      if (value === null || value === undefined || value === '') return;
      lines.push(`| ${label} | \`${escapeTableCell(String(value))}\` |`);
    };
    row('App version', d.appVersion);
    row('Build number', d.buildNumber);
    row('Update ID', d.updateId);
    row('Platform', d.platform);
    row('OS', [d.osName, d.osVersion].filter(Boolean).join(' ') || null);
    row('Device', d.deviceModel);
    row('Brand', d.deviceBrand);
    row('Manufacturer', d.deviceManufacturer);
    row('Year class', d.deviceYearClass);
    row('Locale', d.locale);
    row('Time zone', d.timeZone);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (req.contact) {
    lines.push(`> Contact: ${escapeMarkdownInline(req.contact)}`);
    lines.push('');
  }

  lines.push('<sub>Submitted via the in-app feedback form.</sub>');
  return lines.join('\n');
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function escapeMarkdownInline(s: string): string {
  return s.replace(/[<>`]/g, (c) => `\\${c}`);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

function json(data: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function cors(env: Env, response: Response): Response {
  // Native apps don't enforce CORS, but a permissive ACAO is harmless and lets
  // a hypothetical web-target submit too. Tighten via ALLOWED_ORIGINS if/when
  // a web build ships.
  const allow = env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : '*';
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allow);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

