/**
 * Shared redaction utilities for diagnostic payloads.
 *
 * Two-layer defence:
 *  1. Key-name redactor — walks arbitrary objects and replaces values for
 *     known sensitive keys with '[redacted]' BEFORE stringification.
 *     Catches things regex can't (base64 keys, short tokens, opaque IDs).
 *  2. Regex scrubber — runs LEAK_PATTERNS over the resulting string to catch
 *     sensitive values that arrived via string args or slipped through
 *     the object walker.
 *
 * This module is the single source of truth for redaction rules. The
 * feedback worker mirrors these patterns in its own `LEAK_PATTERNS` array
 * and re-runs them server-side as a third defence layer.
 *
 * Per .cursorrules security rule #1: NEVER log, cache, or persist
 * sensitive data in plaintext.
 */

// ── Key-name redactor ───────────────────────────────────────────────────────

/**
 * Object keys whose values are always redacted, regardless of the value's
 * content. Case-sensitive intentionally — matches how they appear in code.
 */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  // Auth material — camelCase
  'token', 'authToken', 'deviceToken', 'gatewayToken', 'bearerToken',
  'accessToken', 'refreshToken', 'idToken', 'apiKey',
  // Auth material — snake_case (common in gateway JSON payloads)
  'auth_token', 'api_key',
  // Auth material — HTTP header names
  'Token', 'Authorization',
  // Crypto material — camelCase
  'privateKey', 'publicKey', 'secretKey', 'signature', 'nonce',
  'spki', 'spkiSha256', 'firstSeenSpkiSha256',
  // Crypto material — snake_case
  'private_key', 'public_key',
  // Network locations
  'gatewayUrl', 'serverUrl', 'url', 'endpoint', 'baseUrl',
  // User / session identity — camelCase
  'sessionId', 'deviceId', 'userId', 'accountId',
  // User / session identity — snake_case
  'session_id', 'device_id',
  // Message content
  'body', 'content', 'messageContent', 'text', 'prompt', 'input',
  'message', 'messages',
]);

const MAX_DEPTH = 6;

/**
 * Walk `v` recursively and replace values for SENSITIVE_KEYS with
 * '[redacted]'. Returns a new value; never mutates the input.
 */
export function redactObject(v: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[depth-limited]';
  if (v === null || v === undefined) return v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    return v.map((item) => redactObject(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? '[redacted]' : redactObject(val, depth + 1);
  }
  return out;
}

// ── Regex scrubber ──────────────────────────────────────────────────────────

/**
 * Patterns checked against the final string form of a payload. Each match
 * is replaced with '[redacted]'. Order matters — more specific patterns
 * should come before broad ones so replacement placeholders don't retrigger.
 *
 * Mirrored in infra/feedback-worker/src/leakPatterns.ts — keep in sync.
 */
export const LEAK_PATTERNS: ReadonlyArray<RegExp> = [
  // WebSocket and HTTPS URLs (most specific first)
  /\bwss?:\/\/\S+/gi,
  /\bhttps?:\/\/\S+/gi,
  // Bearer token header values
  /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/gi,
  // key=value or key:value token patterns
  /\btoken\s*[=:]\s*\S{8,}/gi,
  // JWT: three base64url segments separated by dots
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // Standard UUID format (session IDs, device IDs)
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  // Hex blobs ≥40 chars (SPKI hashes, Ed25519 raw hex, etc.)
  /\b[a-f0-9]{40,}\b/gi,
  // Base64 blobs ≥30 chars (Ed25519 keys are ~44 chars base64-encoded).
  // Lookahead requires both a lowercase letter and a digit to reduce
  // false-positives on ALL-CAPS strings or pure-lowercase long words.
  /\b(?=[A-Za-z0-9+/]*[a-z])(?=[A-Za-z0-9+/]*[0-9])[A-Za-z0-9+/]{30,}={0,2}\b/g,
];

/**
 * Run all LEAK_PATTERNS against `s`, replace each match with '[redacted]',
 * then truncate to `maxLen`.
 */
export function scrubString(s: string, maxLen = 2000): string {
  let out = s;
  for (const re of LEAK_PATTERNS) {
    // Each pattern uses the /g flag — reset lastIndex defensively.
    re.lastIndex = 0;
    out = out.replace(re, '[redacted]');
  }
  if (out.length > maxLen) {
    out = out.slice(0, maxLen) + '…[truncated]';
  }
  return out;
}

// ── Console arg scrubber ────────────────────────────────────────────────────

/**
 * Convert console.* arguments to a single scrubbed string suitable for
 * storage in the diagnostic ring buffer.
 *
 * Flow:
 *  1. Walk each object arg through `redactObject` (key-name layer).
 *  2. Stringify all args to a single space-joined string.
 *  3. Run `scrubString` (regex layer).
 */
export function scrubConsoleArgs(args: unknown[], maxLen = 500): string {
  const parts = args.map((arg) => {
    if (arg === null || arg === undefined) return String(arg);
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(redactObject(arg));
      } catch {
        return '[unstringifiable]';
      }
    }
    return String(arg);
  });
  return scrubString(parts.join(' '), maxLen);
}
