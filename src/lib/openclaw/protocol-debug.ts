// OpenClaw Protocol — opt-in debug logging helpers
//
// All helpers are no-ops in production and when the
// `EXPO_PUBLIC_DEBUG_CHAT_EVENTS` environment flag is unset. This module
// exists so the long-form payload-formatting strings stay isolated from the
// concurrency-sensitive core of `client.ts`. See sec-011 in
// `docs/audits/findings/X2-security-sweep-findings.md`.
//
// Metro/Hermes tree-shaking is unreliable, so the runtime gate inside each
// helper is the real protection: the bundle ships this module but it does no
// work in production builds.

const ENABLED =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1'

/**
 * Lazy debug logger — `builder` is only called when the debug flag is on, so
 * callers can do expensive payload formatting (Object.keys, Array.map, etc.)
 * without paying the cost in production.
 */
export function logProtocolDebug(scope: string, builder: () => unknown): void {
  if (!ENABLED) return
  let data: unknown
  try {
    data = builder()
  } catch {
    return
  }
  console.log(`[OpenClaw:${scope}]`, data)
}

/** Eager debug logger for simple, already-formatted payloads. */
export function logProtocolEvent(scope: string, data?: unknown): void {
  if (!ENABLED) return
  console.log(`[OpenClaw:${scope}]`, data)
}

/** True when the EXPO_PUBLIC_DEBUG_CHAT_EVENTS flag is enabled (dev only). */
export function isProtocolDebugEnabled(): boolean {
  return ENABLED
}
