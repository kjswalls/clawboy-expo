/**
 * Feedback submission client.
 *
 * Posts a sanitised feedback payload to the configured feedback proxy
 * (`extra.feedbackProxyUrl` in `app.json`). Surfaces typed errors so the
 * UI can render appropriate states (rate-limit, leak-blocked, etc.).
 */
import Constants from 'expo-constants';

import { generateUUID } from '@/lib/openclaw/utils';

import type { FeedbackDiagnostics } from './diagnostics';

const REQUEST_TIMEOUT_MS = 15_000;

export type FeedbackKind = 'bug' | 'feature';

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  body: string;
  contact?: string;
  diagnostics?: FeedbackDiagnostics;
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

  const payload = {
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    contact: input.contact?.trim() ? input.contact.trim() : undefined,
    diagnostics: input.diagnostics,
    clientNonce: input.clientNonce ?? generateUUID(),
  };

  // First attempt + one retry on bare network errors only. Rate-limit and
  // validation errors short-circuit immediately.
  const first = await postOnce(url, payload);
  if (first.ok || first.code !== 'network') {
    return first;
  }
  return postOnce(url, payload);
}

async function postOnce(
  url: string,
  body: Record<string, unknown>,
): Promise<FeedbackResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
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

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, code: 'server', message: `Server returned an unexpected response (${res.status}).` };
  }

  if (res.ok && isProxySuccess(data)) {
    return { ok: true, issueUrl: data.issueUrl, issueNumber: data.issueNumber };
  }

  if (isProxyError(data)) {
    const code = mapErrorCode(data.error, res.status);
    const message = humanMessage(code, data.message);
    if (code === 'rate_limited') {
      return { ok: false, code, message, retryAfter: data.retryAfter };
    }
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
    case 'upstream_github':
    case 'server_error':
      return 'server';
    default:
      if (status === 429) return 'rate_limited';
      if (status >= 500) return 'server';
      if (status >= 400) return 'validation';
      return 'server';
  }
}

function humanMessage(code: FeedbackErrorCode, fallback: string | undefined): string {
  if (typeof fallback === 'string' && fallback.trim().length > 0) return fallback;
  switch (code) {
    case 'rate_limited':
      return 'Too many submissions. Please try again later.';
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
