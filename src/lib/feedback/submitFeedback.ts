/**
 * Feedback submission client.
 *
 * Posts a sanitised feedback payload to the configured feedback proxy
 * (`extra.feedbackProxyUrl` in `app.json`). Surfaces typed errors so the
 * UI can render appropriate states (rate-limit, leak-blocked, etc.).
 */
import Constants from 'expo-constants';
import i18n from '@/i18n';

import { generateUUID } from '@/lib/openclaw/utils';
import { emitFeedbackSent } from '@/badges/events';
import { getDevBypassToken } from './devBypassToken';

import type { FeedbackDiagnostics } from './diagnostics';
import type { FeedbackScreenshot } from './prepareFeedbackScreenshots';

const REQUEST_TIMEOUT_MS = 15_000;
/** Extended timeout when screenshots are included — uploading to GitHub takes longer. */
const REQUEST_TIMEOUT_WITH_SCREENSHOTS_MS = 60_000;

export type FeedbackKind = 'bug' | 'feature';

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  body: string;
  contact?: string;
  diagnostics?: FeedbackDiagnostics;
  /** Compressed JPEG screenshots to attach to the issue. Max 3. */
  screenshots?: FeedbackScreenshot[];
  /**
   * Stable id per submission attempt — generated when the form opens, not
   * per "submit" tap. Lets the worker dedupe retries against transient
   * errors without creating duplicate issues.
   */
  clientNonce?: string;
}

export type FeedbackErrorCode =
  | 'not_configured'
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'leak_blocked'
  | 'validation'
  | 'server';

export type FeedbackResult =
  | { ok: true; issueUrl: string; issueNumber: number }
  | { ok: false; code: FeedbackErrorCode; message: string; retryAfter?: number };

interface ProxyError {
  ok: false;
  error?: string;
  message?: string;
  retryAfter?: number;
}

interface ProxySuccess {
  ok: true;
  issueUrl: string;
  issueNumber: number;
}

/**
 * Read the feedback proxy URL from Expo config. Returns `null` if the URL
 * is missing or insecure (e.g. dev build without a deployment yet).
 */
export function getFeedbackProxyUrl(): string | null {
  const raw = Constants.expoConfig?.extra?.feedbackProxyUrl;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // TLS-only — refuse to send a feedback payload over plaintext.
  if (!/^https:\/\//i.test(raw)) return null;
  return raw;
}

export async function submitFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const url = getFeedbackProxyUrl();
  if (url == null) {
    return {
      ok: false,
      code: 'not_configured',
      message: 'Feedback service is not configured for this build.',
    };
  }

  const hasScreenshots = (input.screenshots?.length ?? 0) > 0;
  const timeoutMs = hasScreenshots ? REQUEST_TIMEOUT_WITH_SCREENSHOTS_MS : REQUEST_TIMEOUT_MS;

  const payload = {
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    contact: input.contact?.trim() ? input.contact.trim() : undefined,
    diagnostics: input.diagnostics,
    screenshots: input.screenshots?.length ? input.screenshots : undefined,
    clientNonce: input.clientNonce ?? generateUUID(),
  };

  const first = await postOnce(url, payload, timeoutMs);
  if (first.ok || first.code !== 'network') {
    return first;
  }
  return postOnce(url, payload, timeoutMs);
}

async function postOnce(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<FeedbackResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // Build-time env var wins (local dev with .env.local). Falls back to a token
  // stored at runtime in the keychain — lets production/TestFlight builds
  // bypass the rate limit without bundling the secret in the binary.
  const envToken = process.env.EXPO_PUBLIC_FEEDBACK_DEV_TOKEN;
  const runtimeToken = await getDevBypassToken();
  const devToken =
    typeof envToken === 'string' && envToken.length > 0 ? envToken : runtimeToken;
  if (typeof devToken === 'string' && devToken.length > 0) {
    headers['X-Feedback-Dev-Token'] = devToken;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, code: 'timeout', message: 'The request took too long. Please try again.' };
    }
    return { ok: false, code: 'network', message: 'Network error. Check your connection and try again.' };
  }
  clearTimeout(timer);

  const rawText = await res.text();

  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { ok: false, code: 'server', message: `Server returned an unexpected response (${res.status}).` };
  }

  if (res.ok && isProxySuccess(data)) {
    emitFeedbackSent();
    return { ok: true, issueUrl: data.issueUrl, issueNumber: data.issueNumber };
  }

  if (isProxyError(data)) {
    const code = mapErrorCode(data.error, res.status);
    if (code === 'rate_limited') {
      return {
        ok: false,
        code,
        message: formatRateLimitMessage(data.retryAfter),
        retryAfter: data.retryAfter,
      };
    }
    const message = humanMessage(code, data.message);
    return { ok: false, code, message };
  }

  return { ok: false, code: 'server', message: `Server returned status ${res.status}.` };
}

// ── Type guards ────────────────────────────────────────────────────────────

function isProxySuccess(v: unknown): v is ProxySuccess {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.ok === true &&
    typeof o.issueUrl === 'string' &&
    typeof o.issueNumber === 'number'
  );
}

function isProxyError(v: unknown): v is ProxyError {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.ok === false;
}

function mapErrorCode(error: string | undefined, status: number): FeedbackErrorCode {
  switch (error) {
    case 'rate_limited':
      return 'rate_limited';
    case 'leak_blocked':
      return 'leak_blocked';
    case 'validation':
    case 'invalid_json':
      return 'validation';
    case 'method_not_allowed':
    case 'upstream_github':
    case 'server_error':
      return 'server';
    default:
      // Unknown error codes from a 4xx are routing/config issues from our
      // perspective, not user-input problems. Mapping them to 'validation'
      // would produce a misleading "Some fields look off" message.
      if (status === 429) return 'rate_limited';
      if (status >= 400) return 'server';
      return 'server';
  }
}

/**
 * Formats a human-readable "try again in …" message for a rate-limit response,
 * using the `retryAfter` seconds returned by the worker.
 */
function formatRateLimitMessage(retryAfter?: number): string {
  if (typeof retryAfter !== 'number' || retryAfter <= 0) {
    return i18n.t('feedback.errorRateLimitedDetail');
  }
  if (retryAfter < 60) {
    return i18n.t('feedback.errorRateLimitedDetail_seconds', { count: retryAfter });
  }
  if (retryAfter < 3600) {
    const minutes = Math.ceil(retryAfter / 60);
    return i18n.t(
      minutes === 1
        ? 'feedback.errorRateLimitedDetail_minutes_one'
        : 'feedback.errorRateLimitedDetail_minutes_other',
      { count: minutes },
    );
  }
  const hours = Math.ceil(retryAfter / 3600);
  return i18n.t(
    hours === 1
      ? 'feedback.errorRateLimitedDetail_hours_one'
      : 'feedback.errorRateLimitedDetail_hours_other',
    { count: hours },
  );
}

function humanMessage(code: FeedbackErrorCode, fallback: string | undefined): string {
  if (typeof fallback === 'string' && fallback.trim().length > 0) return fallback;
  switch (code) {
    case 'rate_limited':
      return i18n.t('feedback.errorRateLimitedDetail');
    case 'leak_blocked':
      return 'Please remove URLs or tokens from your message before submitting.';
    case 'validation':
      return 'Some fields look off — please review and try again.';
    case 'server':
      return 'Something went wrong on our end. Please try again in a moment.';
    case 'timeout':
      return 'The request took too long. Please try again.';
    case 'network':
      return 'Network error. Check your connection and try again.';
    case 'not_configured':
      return 'Feedback service is not configured for this build.';
  }
}
