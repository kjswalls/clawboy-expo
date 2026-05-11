/**
 * Tests for consoleBuffer.ts.
 *
 * `installConsoleBuffer` patches the global `console`, so we load the module
 * once for the whole suite, install once, and reset the ring buffer with
 * `clearLogBuffer()` between tests.
 */

import {
  installConsoleBuffer,
  getRecentLogs,
  clearLogBuffer,
  getLogCount,
} from '../consoleBuffer';

// Install once before any tests run.
beforeAll(() => {
  installConsoleBuffer();
});

beforeEach(() => {
  clearLogBuffer();
});

describe('basic capture', () => {
  it('captures log entries', () => {
    // eslint-disable-next-line no-console
    console.log('alpha');
    expect(getLogCount()).toBe(1);
  });

  it('captures warn entries with correct level label', () => {
    // eslint-disable-next-line no-console
    console.warn('beta');
    const logs = getRecentLogs();
    expect(logs).toContain('[WARN] beta');
  });

  it('returns empty string from getRecentLogs when buffer is empty', () => {
    expect(getRecentLogs()).toBe('');
  });

  it('returns entries in chronological order', () => {
    // eslint-disable-next-line no-console
    console.log('first');
    // eslint-disable-next-line no-console
    console.log('second');
    // eslint-disable-next-line no-console
    console.log('third');

    const logs = getRecentLogs();
    expect(logs.indexOf('first')).toBeLessThan(logs.indexOf('second'));
    expect(logs.indexOf('second')).toBeLessThan(logs.indexOf('third'));
  });
});

describe('clearLogBuffer', () => {
  it('resets count to zero', () => {
    // eslint-disable-next-line no-console
    console.log('before clear');
    expect(getLogCount()).toBe(1);

    clearLogBuffer();
    expect(getLogCount()).toBe(0);
  });

  it('makes getRecentLogs return empty string', () => {
    // eslint-disable-next-line no-console
    console.log('before clear');
    clearLogBuffer();
    expect(getRecentLogs()).toBe('');
  });
});

describe('scrubbing at write time', () => {
  it('redacts a token value in a logged object', () => {
    // eslint-disable-next-line no-console
    console.log({ token: 'super-secret-value-12345' });

    const logs = getRecentLogs();
    expect(logs).not.toContain('super-secret-value-12345');
    expect(logs).toContain('[redacted]');
  });

  it('redacts a WebSocket URL in a logged string', () => {
    // eslint-disable-next-line no-console
    console.log('connecting to wss://my-private-server.example.com/ws');

    const logs = getRecentLogs();
    expect(logs).not.toContain('wss://my-private-server.example.com');
    expect(logs).toContain('[redacted]');
  });
});

describe('ring wrap-around', () => {
  it('caps at 200 entries when 201 are logged, oldest is evicted', () => {
    for (let i = 0; i < 201; i++) {
      // eslint-disable-next-line no-console
      console.log(`entry-${i}`);
    }

    expect(getLogCount()).toBe(200);

    const logs = getRecentLogs();
    // entry-0 should have been evicted
    // Use exact boundary match to avoid 'entry-0' matching 'entry-10' etc.
    expect(logs).not.toMatch(/\bentry-0\b/);
    // entry-1 should be the oldest remaining (entries are newline-joined, no trailing space)
    expect(logs).toMatch(/entry-1\n|entry-1$/);
    // entry-200 should be the newest
    expect(logs).toContain('entry-200');

    // Chronological order: entry-1 before entry-200
    expect(logs.indexOf('entry-1')).toBeLessThan(logs.indexOf('entry-200'));
  });
});

describe('idempotent install', () => {
  it('calling installConsoleBuffer twice does not double-count a single log', () => {
    // The second call should be a no-op due to the sentinel guard
    installConsoleBuffer();

    // eslint-disable-next-line no-console
    console.log('once');
    expect(getLogCount()).toBe(1);
  });

  it('console.log has the __cbWrapped sentinel marker', () => {
    const wrapped = console.log as unknown as Record<string, unknown>;
    expect(wrapped['__cbWrapped']).toBe(true);
  });
});
