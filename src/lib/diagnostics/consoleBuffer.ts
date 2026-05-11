/**
 * In-memory console ring buffer for diagnostic purposes.
 *
 * When installed (via `installConsoleBuffer()`), patches console.log/info/
 * warn/error/debug to capture a bounded, scrubbed log of recent entries in
 * RAM. The original console functions are always called first so dev tooling
 * (Metro, Flipper) is unaffected.
 *
 * Key properties:
 * - RAM-only. Nothing touches disk. Lost on cold start.
 * - Scrubbed at *write* time using the two-layer redactor from scrub.ts.
 *   Sensitive data never sits in the buffer, even pre-submission.
 * - No object refs retained. All args are stringified immediately.
 * - Ring buffer: oldest entries are overwritten when MAX_ENTRIES is reached.
 * - Idempotent install: calling installConsoleBuffer() multiple times is safe.
 */
import { scrubConsoleArgs } from './scrub';

const MAX_ENTRIES = 200;
const MAX_CHARS_PER_LINE = 500;

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface Entry {
  ts: number;
  level: LogLevel;
  /** Already scrubbed + truncated. */
  text: string;
}

// Module-level ring buffer — lives for the lifetime of the JS runtime.
const buffer: Entry[] = new Array<Entry>(MAX_ENTRIES);
let cursor = 0;
let count = 0;
let installed = false;

/** Wrap a console method to capture args into the ring buffer. */
function wrap(level: LogLevel, orig: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]): void => {
    // Always forward to original first — Metro/Flipper/debugger unaffected.
    orig.apply(console, args);
    const text = scrubConsoleArgs(args, MAX_CHARS_PER_LINE);
    buffer[cursor] = { ts: Date.now(), level, text };
    cursor = (cursor + 1) % MAX_ENTRIES;
    if (count < MAX_ENTRIES) count++;
  };
}

// Sentinel property name set on each wrapped function so we can detect
// double-wrapping after Metro Fast Refresh re-evaluates this module.
const SENTINEL = '__cbWrapped';

/**
 * Install the ring buffer tap on the global `console` object.
 * Safe to call multiple times — only installs once per JS runtime.
 *
 * Fast Refresh guard: Metro can re-evaluate this module during development
 * without tearing down the JS runtime, which would reset `installed` to false
 * while `console.log` still holds the previous wrapped function. We detect
 * this by checking for a non-enumerable sentinel on `console.log` and skip
 * re-wrapping if it's already there.
 */
export function installConsoleBuffer(): void {
  if (installed) return;
  // Check the sentinel on console.log as a proxy for all methods — if this
  // module was already installed in this JS runtime (e.g. Metro Fast Refresh
  // re-evaluated the file without a full reload), bail out.
  if ((console.log as unknown as Record<string, unknown>)[SENTINEL]) return;
  installed = true;

  const levels: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  for (const level of levels) {
    const orig = (console[level] as (...args: unknown[]) => void).bind(console);
    const wrapped = wrap(level, orig);
    // Tag the wrapped function so Fast Refresh can detect an already-installed buffer.
    Object.defineProperty(wrapped, SENTINEL, { value: true, enumerable: false });
    // eslint-disable-next-line no-console
    (console[level] as unknown) = wrapped;
  }
}

/**
 * Read recent log entries as a single newline-joined string.
 * Entries are returned in chronological order (oldest first).
 * The buffer is already scrubbed — no additional redaction needed.
 */
export function getRecentLogs(): string {
  if (count === 0) return '';
  const lines: string[] = [];
  const start = count < MAX_ENTRIES ? 0 : cursor;
  for (let i = 0; i < count; i++) {
    const idx = (start + i) % MAX_ENTRIES;
    const entry = buffer[idx];
    if (!entry) continue;
    const ts = new Date(entry.ts).toISOString().slice(11, 23); // HH:mm:ss.mmm
    lines.push(`${ts} [${entry.level.toUpperCase()}] ${entry.text}`);
  }
  return lines.join('\n');
}

/**
 * Clear the ring buffer. Called after a successful feedback submission
 * so stale entries don't bleed into the next report.
 */
export function clearLogBuffer(): void {
  cursor = 0;
  count = 0;
}

/** Expose current entry count for testing. */
export function getLogCount(): number {
  return count;
}
