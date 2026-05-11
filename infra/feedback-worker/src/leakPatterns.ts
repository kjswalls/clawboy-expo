/**
 * Canonical LEAK_PATTERNS for the feedback worker.
 *
 * Must stay in sync with `src/lib/diagnostics/scrub.ts` in the app.
 * The app runs the same set client-side before any data leaves the device;
 * the worker re-runs them server-side as a third defence layer.
 *
 * Keep both pattern arrays byte-for-byte identical. A CI test in the app
 * repo (`src/lib/diagnostics/__tests__/scrub-parity.test.ts`) compares
 * their string representations to catch drift.
 *
 * All patterns carry the /g flag so String.replace scrubs EVERY occurrence,
 * not just the first match.
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
