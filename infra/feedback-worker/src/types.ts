export interface Env {
  // Secrets (wrangler secret put)
  GITHUB_PAT: string;
  ALLOWED_ORIGINS?: string;
  /**
   * Optional shared secret for dev/testing. When the incoming request contains
   * an `X-Feedback-Dev-Token` header whose value matches this secret, the
   * per-IP rate-limit check is skipped entirely. The leak filter still runs.
   * Set via `wrangler secret put DEV_BYPASS_TOKEN`. Never commit the value.
   * Minimum 16 characters — shorter values are ignored.
   */
  DEV_BYPASS_TOKEN?: string;

  // Public vars (wrangler.toml [vars])
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  APP_LABEL: string;
  /** Default branch for screenshot uploads. Defaults to "main". */
  GITHUB_DEFAULT_BRANCH?: string;

  // KV bindings
  FEEDBACK_KV: KVNamespace;
}

export type FeedbackKind = 'bug' | 'feature';

export type ConnectionStatus =
  | 'disconnected' | 'connecting' | 'connected' | 'error'
  | 'pairing_required' | 'identity_rejected' | 'pin_mismatch';

export type ConnectionErrorCode = 'auth_failed' | 'cert_error' | 'timeout' | 'network';
export type ConnectionHint = 'check_tailscale' | 'no_internet';

export interface ConnectionDiagnostics {
  status?: ConnectionStatus;
  errorCode?: ConnectionErrorCode;
  hint?: ConnectionHint;
  serverVersion?: string;
  reconnectGeneration?: number;
  pinningEnabled?: boolean;
  pinMismatch?: boolean;
}

export interface FeedbackDiagnostics {
  appName?: string;
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
  connection?: ConnectionDiagnostics;
}

export interface FeedbackScreenshot {
  mimeType: 'image/jpeg';
  base64: string;
}

export interface FeedbackRequest {
  kind: FeedbackKind;
  title: string;
  body: string;
  contact?: string;
  diagnostics?: FeedbackDiagnostics;
  screenshots?: FeedbackScreenshot[];
  /**
   * Opt-in scrubbed console log dump from the app's in-memory ring buffer.
   * Validated against LEAK_PATTERNS server-side as a second defence layer.
   */
  recentLogs?: string;
  clientNonce: string;
}

export interface SuccessResponse {
  ok: true;
  issueUrl: string;
  issueNumber: number;
}

export interface ErrorResponse {
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
