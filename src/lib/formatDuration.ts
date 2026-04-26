/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * Examples:
 *   300ms  →  "300ms"
 *   2500ms →  "2.5s"
 *   90000ms → "1m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    const rounded = Math.round(totalSeconds * 10) / 10;
    return rounded === Math.floor(rounded)
      ? `${Math.floor(rounded)}s`
      : `${rounded}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}
