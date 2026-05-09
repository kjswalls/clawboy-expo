/**
 * Runtime feedback rate-limit bypass token.
 *
 * Stores a developer-supplied shared secret in the iOS Keychain / Android
 * Keystore (via expo-secure-store) so that production builds can skip the
 * per-IP rate limit on the feedback worker without bundling the token in the
 * app binary.
 *
 * The token is compared against the worker's `DEV_BYPASS_TOKEN` CF secret on
 * every feedback submission. The leak filter still runs — this only bypasses
 * the rate limiter.
 *
 * Minimum token length: 16 characters (mirrors the worker's minimum check at
 * infra/feedback-worker/src/index.ts L302).
 */
import * as SecureStore from 'expo-secure-store';

const SECURE_STORE_KEY = 'clawboy.feedbackDevBypassToken';

/** Minimum length enforced by both the app and the worker. */
export const DEV_BYPASS_TOKEN_MIN_LENGTH = 16;

export interface DevBypassTokenStatus {
  set: boolean;
  /** Masked preview, e.g. `"abcd…wxyz"`. `null` when not set. */
  preview: string | null;
}

/** Returns the stored token, or `null` if absent / too short. */
export async function getDevBypassToken(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_STORE_KEY);
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length >= DEV_BYPASS_TOKEN_MIN_LENGTH ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Persists `value` to the keychain.
 * Throws with a descriptive message if the value is empty or too short.
 */
export async function setDevBypassToken(value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('Token must not be empty.');
  }
  if (trimmed.length < DEV_BYPASS_TOKEN_MIN_LENGTH) {
    throw new Error(`Token must be at least ${DEV_BYPASS_TOKEN_MIN_LENGTH} characters.`);
  }
  await SecureStore.setItemAsync(SECURE_STORE_KEY, trimmed);
}

/** Removes the stored token. Safe to call when no token is set. */
export async function clearDevBypassToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
  } catch {
    // Not set — nothing to do.
  }
}

/**
 * Returns UI display state without exposing the full token value.
 * Preview format: first 4 chars + "…" + last 4 chars.
 */
export async function getDevBypassTokenStatus(): Promise<DevBypassTokenStatus> {
  const token = await getDevBypassToken();
  if (token === null) {
    return { set: false, preview: null };
  }
  const preview =
    token.length <= 8
      ? `${token.slice(0, 2)}…${token.slice(-2)}`
      : `${token.slice(0, 4)}…${token.slice(-4)}`;
  return { set: true, preview };
}
