/**
 * Gateway media URL resolution and authenticated source building.
 *
 * The OpenClaw gateway serves locally-generated media (screenshots, audio,
 * images) via a dedicated endpoint:
 *
 *   GET /__openclaw__/assistant-media?source=<encoded-path>
 *
 * The endpoint accepts auth via:
 *   - `Authorization: Bearer <token>` header (preferred)
 *   - `?token=<token>` query parameter (fallback — only use when headers
 *     are not supported by the consumer)
 *
 * Use `resolveMediaUrl` to normalize raw paths/URLs to the correct gateway
 * URL, then `buildAuthedSource` to produce a `{ uri, headers }` object
 * suitable for expo-image, expo-audio, expo-video, and FileSystem downloads.
 *
 * Device-local `file://` URIs (e.g. optimistic user attachments written to
 * the app cache) are intentionally NOT rewritten to gateway URLs — they are
 * returned as `null` from `resolveMediaUrl` so callers fall back to rendering
 * `{ uri: src }` directly with expo-image, which can read local file URIs.
 * Only server-issued absolute/tilde paths (`/tmp/…`, `~/…`) get proxied.
 */

const ASSISTANT_MEDIA_PATH = '/__openclaw__/assistant-media'

/** Allowed inline data URI prefixes that may be passed to renderers directly. */
const SAFE_DATA_SCHEMES = /^data:(image|audio|video)\//i

/** Allowed remote URL schemes for direct pass-through. */
const SAFE_REMOTE_SCHEMES = /^https?:\/\//i

function wsToHttpHost(gatewayUrl: string): string {
  try {
    const u = new URL(gatewayUrl)
    const protocol = u.protocol === 'wss:' ? 'https:' : u.protocol === 'ws:' ? 'http:' : u.protocol
    return `${protocol}//${u.host}`
  } catch {
    return ''
  }
}

function resolveLocalPath(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // `file://` URIs are device-local paths (e.g. app cache from a pasted or
  // picked attachment). The gateway cannot read these — return null so the
  // caller falls back to rendering the URI directly with expo-image.
  if (trimmed.startsWith('file://')) {
    return null
  }

  if (trimmed.startsWith('~/')) {
    // Tilde paths — server will expand on its end; send as-is
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    return trimmed
  }

  return null
}

export interface ResolvedMediaUrl {
  /** The URL safe to pass to a network fetcher/renderer. */
  url: string
  /** True when the URL targets the gateway assistant-media endpoint. */
  isGatewaySource: boolean
}

/**
 * Normalize a raw media path or URL received from the gateway into a form
 * that can be fetched by the app.
 *
 * - Absolute server paths (`/tmp/...`, `~/...`) → gateway assistant-media endpoint
 * - `data:image/*`, `data:audio/*`, `data:video/*` → returned as-is
 * - `http://`, `https://` → returned as-is (may still need auth headers
 *   if the URL points back at the same gateway host)
 * - `file://` (device-local cache URIs) → null; caller should render directly
 * - Everything else → null (rejected; do not render)
 */
export function resolveMediaUrl(
  raw: string | undefined | null,
  gatewayUrl: string | undefined,
): ResolvedMediaUrl | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Safe inline data URIs — render directly, no network request needed
  if (SAFE_DATA_SCHEMES.test(trimmed)) {
    return { url: trimmed, isGatewaySource: false }
  }

  // Direct remote URLs — pass through
  if (SAFE_REMOTE_SCHEMES.test(trimmed)) {
    return { url: trimmed, isGatewaySource: false }
  }

  // Server-issued local path (absolute or tilde) — proxy through gateway
  const localPath = resolveLocalPath(trimmed)
  if (localPath !== null) {
    const host = wsToHttpHost(gatewayUrl ?? '')
    const url = `${host}${ASSISTANT_MEDIA_PATH}?source=${encodeURIComponent(localPath)}`
    return { url, isGatewaySource: true }
  }

  // Reject all other schemes (javascript:, blob:, custom://, etc.)
  return null
}

export interface AuthedSource {
  uri: string
  headers: { Authorization?: string }
}

/**
 * Produce a `{ uri, headers }` object that carries a Bearer token alongside
 * the media URL. Compatible with expo-image `source`, expo-audio
 * `useAudioPlayer(source)`, expo-video `useVideoPlayer(source)`, and
 * `FileSystem.createDownloadResumable(uri, dest, { headers })`.
 *
 * When `token` is falsy, the `Authorization` header is omitted entirely so
 * that reverse-proxies which reject empty `Authorization` headers pass the
 * request through correctly.
 */
export function buildAuthedSource(url: string, token: string | null | undefined): AuthedSource {
  return {
    uri: url,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }
}

/**
 * Fallback: append auth token as a query param instead of a header.
 * Only use this when the consumer CANNOT accept custom headers and the URL
 * is a gateway endpoint (not an external URL where the token would leak).
 *
 * The token is URL-encoded to handle special characters.
 *
 * NOTE: Call sites MUST strip `?token=` before sharing or logging these URLs.
 */
export function buildAuthedSourceNoHeaders(
  url: string,
  token: string | null | undefined,
): { uri: string } {
  if (!token) return { uri: url }
  const sep = url.includes('?') ? '&' : '?'
  return { uri: `${url}${sep}token=${encodeURIComponent(token)}` }
}

/**
 * Sanitize a URL for safe clipboard/display use by stripping the `?token=`
 * query parameter (and any `&token=` continuation) if present.
 */
export function sanitizeUrlForDisplay(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('token')
    return u.toString()
  } catch {
    return url
  }
}
