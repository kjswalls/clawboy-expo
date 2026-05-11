/**
 * Structured internal error codes for ClawBoy.
 *
 * These are thrown by our own JS/TS code (protocol layer, hooks, utilities).
 * The `code` is stable and used by `translateClawError` to look up the
 * localised UI string. The `message` field carries the English code + params
 * for logs and Sentry, and is never shown directly in the UI.
 *
 * Native SDK errors (Apple/Google sign-in, StoreKit, CFNetwork) and raw
 * gateway server messages are left as plain `Error` instances so they pass
 * through `translateClawError` unchanged (iOS already localises CFNetwork;
 * gateway messages are accepted English for power users).
 */

export type ClawErrorCode =
  | 'not_connected'
  | 'request_timeout'
  | 'main_session_undeletable'
  | 'feedback_token_empty'
  | 'feedback_token_too_short';

export class ClawError extends Error {
  readonly code: ClawErrorCode;
  readonly params?: Record<string, string | number>;

  constructor(code: ClawErrorCode, params?: Record<string, string | number>) {
    super(`[${code}]${params ? ' ' + JSON.stringify(params) : ''}`);
    this.name = 'ClawError';
    this.code = code;
    this.params = params;
  }
}
