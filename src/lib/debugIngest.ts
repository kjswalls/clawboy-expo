const DEBUG_INGEST_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_DEBUG_INGEST === '1';
const INGEST_URL =
  'http://127.0.0.1:7890/ingest/87489951-ec79-41a8-ac31-21df0b59dde2';
const SESSION_ID = '82d45a';

/**
 * Fire-and-forget debug ingest helper. Calls `build()` and POSTs the result
 * to a local dev endpoint ONLY when `__DEV__` is true AND the env var
 * `EXPO_PUBLIC_DEBUG_INGEST=1` is set.
 *
 * The `build` thunk pattern means payload construction (string slices,
 * JSON.stringify, etc.) is fully short-circuited when the gate is off —
 * so calling this in hot paths (render loops, per-frame callbacks) costs
 * essentially nothing in normal use.
 *
 * To re-enable: add `EXPO_PUBLIC_DEBUG_INGEST=1` to `.env.local` and restart Metro.
 */
export function debugIngest(build: () => Record<string, unknown>): void {
  if (!DEBUG_INGEST_ENABLED) return;
  try {
    const body = JSON.stringify({
      sessionId: SESSION_ID,
      ...build(),
      timestamp: Date.now(),
    });
    fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': SESSION_ID,
      },
      body,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
