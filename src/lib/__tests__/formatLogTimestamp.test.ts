import {
  formatLogTime,
  formatLogDay,
  logDayKey,
  type LogTimeFormat,
} from '../formatLogTimestamp';

// ── formatLogTime ─────────────────────────────────────────────────────────────

describe('formatLogTime', () => {
  const ISO_UTC_NOON = '2026-04-23T12:34:56.000Z'; // UTC 12:34:56

  test('null → 8-char spacer', () => {
    expect(formatLogTime(null, 'utc')).toBe('        ');
    expect(formatLogTime(null, 'local')).toBe('        ');
  });

  test('UTC mode: returns UTC time', () => {
    const result = formatLogTime(ISO_UTC_NOON, 'utc');
    expect(result).toBe('12:34:56');
  });

  test('UTC mode: hour boundary', () => {
    expect(formatLogTime('2026-04-23T00:00:00.000Z', 'utc')).toBe('00:00:00');
    expect(formatLogTime('2026-04-23T23:59:59.000Z', 'utc')).toBe('23:59:59');
  });

  test('local mode: returns a valid HH:MM:SS string', () => {
    const result = formatLogTime(ISO_UTC_NOON, 'local');
    // Should be an 8-char HH:MM:SS regardless of machine TZ
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('invalid iso string → 8-char spacer', () => {
    expect(formatLogTime('not-a-date', 'utc')).toBe('        ');
    expect(formatLogTime('not-a-date', 'local')).toBe('        ');
  });
});

// ── logDayKey ─────────────────────────────────────────────────────────────────

describe('logDayKey', () => {
  test('UTC mode: slices ISO date portion', () => {
    expect(logDayKey('2026-04-23T23:59:59.999Z', 'utc')).toBe('2026-04-23');
    expect(logDayKey('2026-04-24T00:00:00.000Z', 'utc')).toBe('2026-04-24');
  });

  test('returns YYYY-MM-DD format for local mode', () => {
    const key = logDayKey('2026-04-23T12:00:00.000Z', 'local');
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('invalid iso → "invalid"', () => {
    expect(logDayKey('bad', 'utc')).toBe('invalid');
    expect(logDayKey('bad', 'local')).toBe('invalid');
  });

  test('UTC/local keys differ at day boundaries depending on TZ offset', () => {
    // This just ensures both return a valid YYYY-MM-DD.
    const modes: LogTimeFormat[] = ['utc', 'local'];
    for (const mode of modes) {
      const key = logDayKey('2026-04-23T22:00:00.000Z', mode);
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ── formatLogDay ──────────────────────────────────────────────────────────────

describe('formatLogDay', () => {
  // Pin "today" relative to the real clock; these tests use UTC mode to avoid
  // machine-TZ flakiness.

  test('today → "Today"', () => {
    const nowIso = new Date().toISOString();
    expect(formatLogDay(nowIso, 'utc')).toBe('Today');
  });

  test('yesterday → "Yesterday"', () => {
    const yd = new Date(Date.now() - 86_400_000).toISOString();
    expect(formatLogDay(yd, 'utc')).toBe('Yesterday');
  });

  test('older date → formatted label', () => {
    const label = formatLogDay('2026-01-01T00:00:00.000Z', 'utc');
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    // Should look like "Jan 1, 2026" or similar
    expect(label).toMatch(/\d{4}/);
  });
});
