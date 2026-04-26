/**
 * Format a raw token count into a compact human-readable string.
 *
 * Examples:
 *   850       → "850"
 *   1200      → "1.2k"
 *   125_000   → "125k"
 *   1_000_000 → "1M"
 *   2_500_000 → "2.5M"
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    const v = tokens / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const v = tokens / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  return String(tokens);
}

/**
 * Format a token count as a context-window label, e.g. "128k ctx".
 * Used in model picker rows.
 */
export function formatCtxWindow(tokens: number): string {
  return `${formatTokenCount(tokens)} ctx`;
}
