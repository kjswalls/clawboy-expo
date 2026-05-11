/**
 * Tests for useSessions hook — sessions-011.
 *
 * Covers:
 *  - sessions.changed event → refreshSessions is called
 *  - streamSessionKey event → currentSessionKey is updated
 *  - requestRefreshSessions debounce / rate-limit logic
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Minimal EventEmitter
// ---------------------------------------------------------------------------
class FakeClient {
  private _listeners: Record<string, Array<(payload?: unknown) => void>> = {};
  listSessionsCalls = 0;
  resolvedSessions: Array<{ key: string; title: string }> = [];
  primaryKey: string | null = null;

  on(event: string, cb: (payload?: unknown) => void): void {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  off(event: string, cb: (payload?: unknown) => void): void {
    this._listeners[event] = (this._listeners[event] ?? []).filter((l) => l !== cb);
  }

  emit(event: string, payload?: unknown): void {
    (this._listeners[event] ?? []).forEach((l) => l(payload));
  }

  async listSessions() {
    this.listSessionsCalls++;
    return this.resolvedSessions;
  }

  setPrimarySessionKey(key: string): void {
    this.primaryKey = key;
  }

  getActiveSessionKey(): string | null {
    return this.primaryKey;
  }
}

// ---------------------------------------------------------------------------
// Simulate the sessions.changed wiring from useSessions (useEffect section)
// ---------------------------------------------------------------------------

describe('sessions.changed event wiring', () => {
  it('registers the sessions.changed listener when connected', () => {
    const client = new FakeClient();
    const openClawRef = { current: client };
    const connectionState = { status: 'connected' as const };
    let refreshCalls = 0;
    const refreshSessions = async () => { refreshCalls++; };

    // Simulate the useEffect body:
    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected') {
      throw new Error('Should have registered');
    }

    const onSessionsChanged = () => { void refreshSessions(); };
    oc.on('sessions.changed', onSessionsChanged);

    // Fire the event:
    client.emit('sessions.changed');

    // Flush micro-tasks:
    return Promise.resolve().then(() => {
      expect(refreshCalls).toBe(1);

      // Cleanup:
      oc.off('sessions.changed', onSessionsChanged);
      client.emit('sessions.changed');
    }).then(() => Promise.resolve()).then(() => {
      // After cleanup, no new calls:
      expect(refreshCalls).toBe(1);
    });
  });

  it('does NOT register when not connected', () => {
    const client = new FakeClient();
    const openClawRef = { current: client };
    const connectionState = { status: 'disconnected' as const };
    let refreshCalls = 0;
    const refreshSessions = async () => { refreshCalls++; };

    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected') {
      // No registration
    } else {
      oc.on('sessions.changed', () => { void refreshSessions(); });
    }

    client.emit('sessions.changed');
    expect(refreshCalls).toBe(0);
  });

  it('fires multiple times on multiple events', async () => {
    const client = new FakeClient();
    let refreshCalls = 0;
    const refreshSessions = async () => { refreshCalls++; };
    const onSessionsChanged = () => { void refreshSessions(); };

    client.on('sessions.changed', onSessionsChanged);
    client.emit('sessions.changed');
    client.emit('sessions.changed');
    client.emit('sessions.changed');

    await Promise.resolve();
    expect(refreshCalls).toBe(3);
  });
});

describe('streamSessionKey event wiring', () => {
  it('updates currentSessionKey when streamSessionKey fires with a valid key', () => {
    const client = new FakeClient();
    let currentSessionKey: string | null = null;

    const onStreamSessionKey = (payload: unknown) => {
      const p = payload as { sessionKey?: string };
      if (typeof p.sessionKey === 'string' && p.sessionKey) {
        currentSessionKey = p.sessionKey;
        client.setPrimarySessionKey(p.sessionKey);
      }
    };

    client.on('streamSessionKey', onStreamSessionKey);
    client.emit('streamSessionKey', { sessionKey: 'sess-new-123' });

    expect(currentSessionKey).toBe('sess-new-123');
    expect(client.primaryKey).toBe('sess-new-123');
  });

  it('ignores empty string sessionKey', () => {
    const client = new FakeClient();
    let currentSessionKey: string | null = 'sess-old';

    const onStreamSessionKey = (payload: unknown) => {
      const p = payload as { sessionKey?: string };
      if (typeof p.sessionKey === 'string' && p.sessionKey) {
        currentSessionKey = p.sessionKey;
      }
    };

    client.on('streamSessionKey', onStreamSessionKey);
    client.emit('streamSessionKey', { sessionKey: '' });

    expect(currentSessionKey).toBe('sess-old'); // unchanged
  });
});

describe('requestRefreshSessions debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces rapid calls into a single refresh', async () => {
    let refreshCalls = 0;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRefreshAt = 0;
    const DEBOUNCE = 500;
    const MIN_INTERVAL = 1500;

    const refreshSessions = async () => {
      refreshCalls++;
      lastRefreshAt = Date.now();
    };

    const requestRefreshSessions = () => {
      if (pendingTimer !== null) return;
      if (Date.now() - lastRefreshAt < MIN_INTERVAL) return;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        void refreshSessions();
      }, DEBOUNCE);
    };

    requestRefreshSessions();
    requestRefreshSessions(); // should be no-op (timer already set)
    requestRefreshSessions(); // should be no-op

    expect(refreshCalls).toBe(0); // Not yet fired

    jest.advanceTimersByTime(600);
    await Promise.resolve();

    expect(refreshCalls).toBe(1);
  });

  it('rate-limits: no-ops if called within MIN_INTERVAL after a refresh', async () => {
    let refreshCalls = 0;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const MIN_INTERVAL = 1500;
    const DEBOUNCE = 500;
    let lastRefreshAt = Date.now(); // simulate just refreshed

    const refreshSessions = async () => { refreshCalls++; };

    const requestRefreshSessions = () => {
      if (pendingTimer !== null) return;
      if (Date.now() - lastRefreshAt < MIN_INTERVAL) return;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        void refreshSessions();
      }, DEBOUNCE);
    };

    requestRefreshSessions(); // should be no-op: too soon after last refresh

    jest.advanceTimersByTime(600);
    await Promise.resolve();

    expect(refreshCalls).toBe(0);
  });
});
