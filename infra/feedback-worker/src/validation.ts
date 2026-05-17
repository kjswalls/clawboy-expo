import type {
  ConnectionDiagnostics,
  ConnectionErrorCode,
  ConnectionHint,
  ConnectionStatus,
  FeedbackDiagnostics,
  FeedbackRequest,
  FeedbackScreenshot,
} from './types';
import { LEAK_PATTERNS } from './leakPatterns';

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

const RECENT_LOGS_MAX = 32_768;

type ValidationResult =
  | { ok: true; value: FeedbackRequest }
  | { ok: false; message: string };

type ScreenshotsValidationResult =
  | { ok: true; value: FeedbackScreenshot[] }
  | { ok: false; message: string };

export function validate(input: unknown): ValidationResult {
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

  let recentLogs: string | undefined;
  if (o.recentLogs != null) {
    if (typeof o.recentLogs !== 'string') {
      return { ok: false, message: '`recentLogs` must be a string.' };
    }
    if (o.recentLogs.length > RECENT_LOGS_MAX) {
      return { ok: false, message: `\`recentLogs\` must be ≤${RECENT_LOGS_MAX} characters.` };
    }
    const trimmed = o.recentLogs.trim();
    recentLogs = trimmed.length > 0 ? trimmed : undefined;
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
      recentLogs,
    },
  };
}

export function validateScreenshots(input: unknown): ScreenshotsValidationResult {
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

export function base64DecodedSize(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Checks that the first bytes of the base64-encoded content match the JPEG
 * magic bytes (FF D8 FF). Only decodes the first 4 bytes.
 */
export function verifyJpegMagicBytes(b64: string): boolean {
  try {
    // 4 bytes needs ceil(4/3)*4 = 8 base64 chars; pad to multiple of 4.
    const prefix = b64.slice(0, 8).padEnd(8, '=');
    const raw = atob(prefix);
    return raw.charCodeAt(0) === 0xFF && raw.charCodeAt(1) === 0xD8 && raw.charCodeAt(2) === 0xFF;
  } catch {
    return false;
  }
}

const VALID_CONNECTION_STATUS: ReadonlySet<string> = new Set([
  'disconnected', 'connecting', 'connected', 'error',
  'pairing_required', 'identity_rejected', 'pin_mismatch',
]);
const VALID_ERROR_CODE: ReadonlySet<string> = new Set(['auth_failed', 'cert_error', 'timeout', 'network']);
const VALID_HINT: ReadonlySet<string> = new Set(['check_tailscale', 'no_internet']);
const SERVER_VERSION_RE = /^[\w.\-+ ]{1,40}$/;

export function sanitizeConnection(c: unknown): ConnectionDiagnostics | undefined {
  if (c === null || typeof c !== 'object') return undefined;
  const o = c as Record<string, unknown>;
  const status = ((): ConnectionStatus | undefined => {
    const s = o['status'];
    return typeof s === 'string' && VALID_CONNECTION_STATUS.has(s) ? (s as ConnectionStatus) : undefined;
  })();
  if (!status) return undefined;

  const errorCode = ((): ConnectionErrorCode | undefined => {
    const e = o['errorCode'];
    return typeof e === 'string' && VALID_ERROR_CODE.has(e) ? (e as ConnectionErrorCode) : undefined;
  })();
  const hint = ((): ConnectionHint | undefined => {
    const h = o['hint'];
    return typeof h === 'string' && VALID_HINT.has(h) ? (h as ConnectionHint) : undefined;
  })();
  const serverVersion = ((): string | undefined => {
    const v = o['serverVersion'];
    return typeof v === 'string' && SERVER_VERSION_RE.test(v) ? v : undefined;
  })();
  const reconnectGeneration = ((): number | undefined => {
    const n = o['reconnectGeneration'];
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  })();
  const pinningEnabled = typeof o['pinningEnabled'] === 'boolean' ? o['pinningEnabled'] : undefined;
  const pinMismatch = typeof o['pinMismatch'] === 'boolean' ? o['pinMismatch'] : undefined;

  return { status, errorCode, hint, serverVersion, reconnectGeneration, pinningEnabled, pinMismatch };
}

export function sanitizeDiagnostics(d: Record<string, unknown>): FeedbackDiagnostics {
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : undefined;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const platform = ((): FeedbackDiagnostics['platform'] => {
    const p = d['platform'];
    return p === 'ios' || p === 'android' || p === 'web' ? p : undefined;
  })();

  return {
    appName: str(d['appName']),
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
    connection: sanitizeConnection(d['connection']),
  };
}

export function findLeak(...fields: Array<string | undefined>): string | null {
  const labels = ['title', 'body', 'contact'];
  for (let i = 0; i < fields.length; i++) {
    const value = fields[i];
    if (typeof value !== 'string' || value.length === 0) continue;
    for (const re of LEAK_PATTERNS) {
      // All patterns carry /g — reset lastIndex before each test() call to
      // prevent stateful carry-over across fields producing false negatives.
      re.lastIndex = 0;
      if (re.test(value)) return labels[i] ?? 'field';
    }
  }
  return null;
}
