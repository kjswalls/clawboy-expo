/**
 * Recover a human-readable filename from a gateway-proxied URL.
 * Prefers the `?source=` query param (which contains the original path),
 * then falls back to the URL's last path segment.
 */
export function deriveFallbackName(src: string): string {
  try {
    const u = new URL(src);
    const source = u.searchParams.get('source');
    if (source) {
      const decoded = decodeURIComponent(source);
      const last = decoded.split('/').pop();
      if (last) return last;
    }
  } catch {
    // not a parseable URL — fall through
  }
  return src.split('/').pop() ?? src;
}
