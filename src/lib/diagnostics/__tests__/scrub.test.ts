import {
  SENSITIVE_KEYS,
  LEAK_PATTERNS,
  redactObject,
  scrubString,
  scrubConsoleArgs,
} from '../scrub';

// ── redactObject ─────────────────────────────────────────────────────────────

describe('redactObject', () => {
  it('replaces values for known sensitive keys at top level', () => {
    const input = { token: 'real-token', name: 'alice', sessionId: 'uuid-abc' };
    const out = redactObject(input) as Record<string, unknown>;
    expect(out['token']).toBe('[redacted]');
    expect(out['sessionId']).toBe('[redacted]');
    expect(out['name']).toBe('alice');
  });

  it('redacts nested sensitive keys', () => {
    const input = { auth: { authToken: 'secret', role: 'admin' }, data: 'ok' };
    const out = redactObject(input) as Record<string, unknown>;
    const auth = out['auth'] as Record<string, unknown>;
    expect(auth['authToken']).toBe('[redacted]');
    expect(auth['role']).toBe('admin');
    expect(out['data']).toBe('ok');
  });

  it('redacts items inside arrays', () => {
    const input = [{ token: 'tok1' }, { token: 'tok2', safe: true }];
    const out = redactObject(input) as Array<Record<string, unknown>>;
    expect(out[0]['token']).toBe('[redacted]');
    expect(out[1]['token']).toBe('[redacted]');
    expect(out[1]['safe']).toBe(true);
  });

  it('returns primitives unchanged', () => {
    expect(redactObject('hello')).toBe('hello');
    expect(redactObject(42)).toBe(42);
    expect(redactObject(null)).toBe(null);
    expect(redactObject(undefined)).toBe(undefined);
  });

  it('depth-limits deeply nested objects', () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 10; i++) {
      const child: Record<string, unknown> = {};
      cur['child'] = child;
      cur = child;
    }
    cur['token'] = 'deep-secret';
    // Should not throw; deeply nested values become '[depth-limited]' or '[redacted]'
    expect(() => redactObject(deep)).not.toThrow();
  });

  it('covers all SENSITIVE_KEYS', () => {
    for (const key of SENSITIVE_KEYS) {
      const input = { [key]: 'sensitive-value', safe: 'ok' };
      const out = redactObject(input) as Record<string, unknown>;
      expect(out[key]).toBe('[redacted]');
      expect(out['safe']).toBe('ok');
    }
  });
});

// ── scrubString ──────────────────────────────────────────────────────────────

describe('scrubString', () => {
  it('redacts wss:// URLs', () => {
    expect(scrubString('connect wss://my.gateway.local:8080/ws')).not.toContain('my.gateway.local');
  });

  it('redacts https:// URLs', () => {
    expect(scrubString('fetch failed: https://api.example.com/v1/chat')).not.toContain('api.example.com');
  });

  it('redacts Bearer tokens', () => {
    const s = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.xyz';
    expect(scrubString(s)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts token= patterns', () => {
    expect(scrubString('token=supersecretvalue123')).not.toContain('supersecretvalue123');
  });

  it('redacts JWT-shaped strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(scrubString(jwt)).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('redacts UUIDs (session/device IDs)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(scrubString(`sessionId ${uuid}`)).not.toContain(uuid);
  });

  it('redacts long hex blobs (SPKI hashes, Ed25519 hex)', () => {
    const hex = 'a'.repeat(64);
    expect(scrubString(`spki=${hex}`)).not.toContain(hex);
  });

  it('redacts base64 blobs (Ed25519 keys are ~44 chars)', () => {
    const b64 = 'MCowBQYDK2VwAyEARqZKaGpFDpT5pLQ6Xtqr+mK8TJt9lA==';
    expect(scrubString(b64)).not.toContain('MCowBQYDK2VwAyEARqZKaGpFDpT5pLQ6Xtqr');
  });

  it('truncates long strings', () => {
    // Use a string with spaces so it doesn't trigger base64 blob detection.
    const long = 'safe log message '.repeat(200);
    const result = scrubString(long, 500);
    expect(result.length).toBeLessThan(520);
    expect(result).toContain('…[truncated]');
  });

  it('leaves safe strings unchanged', () => {
    expect(scrubString('connect ok serverVersion=1.2.3')).toBe('connect ok serverVersion=1.2.3');
  });

  it('all LEAK_PATTERNS have global flag set (safe to reuse)', () => {
    for (const re of LEAK_PATTERNS) {
      expect(re.flags).toContain('g');
    }
  });
});

// ── scrubConsoleArgs ─────────────────────────────────────────────────────────

describe('scrubConsoleArgs', () => {
  it('redacts sensitive keys in object args', () => {
    const out = scrubConsoleArgs([{ token: 'real-token', sessionId: 'abc-123', label: 'ok' }]);
    expect(out).not.toContain('real-token');
    expect(out).not.toContain('abc-123');
    expect(out).toContain('ok');
  });

  it('joins multiple args with space', () => {
    const out = scrubConsoleArgs(['hello', 'world']);
    expect(out).toBe('hello world');
  });

  it('redacts URLs appearing in string args', () => {
    const out = scrubConsoleArgs(['fetch error', 'https://gateway.example.com/v1']);
    expect(out).not.toContain('gateway.example.com');
  });

  it('handles null and undefined args', () => {
    expect(() => scrubConsoleArgs([null, undefined, 'ok'])).not.toThrow();
  });

  it('handles non-serialisable objects gracefully', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => scrubConsoleArgs([circular])).not.toThrow();
  });

  it('truncates to maxLen', () => {
    const out = scrubConsoleArgs(['safe log entry '.repeat(50)], 100);
    expect(out.length).toBeLessThan(120);
    expect(out).toContain('…[truncated]');
  });
});

// ── Worker recentLogs scenarios (uses same LEAK_PATTERNS as worker) ──────────
//
// These tests mirror what infra/feedback-worker/src/index.ts scrubLogsServer()
// does. Since the worker imports its patterns from leakPatterns.ts which is
// verified to be identical to LEAK_PATTERNS here (via scrub-parity.test.ts),
// passing these tests means the server-side scrubber handles the same cases.

describe('LEAK_PATTERNS — worker scrubLogsServer scenarios', () => {
  describe('/g flag: all occurrences are scrubbed', () => {
    it('scrubs ALL UUID occurrences in a multi-line log blob', () => {
      const uuid1 = '12345678-1234-1234-1234-123456789abc';
      const uuid2 = 'abcdef01-abcd-abcd-abcd-abcdef012345';
      const logs = `Session ${uuid1} started\nDevice ${uuid2} connected`;
      const scrubbed = scrubString(logs, 10000);
      expect(scrubbed).not.toContain(uuid1);
      expect(scrubbed).not.toContain(uuid2);
    });

    it('scrubs ALL hex blob occurrences in a log string', () => {
      const hex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'; // 40 hex chars
      const logs = `spki: ${hex}\nfingerprint: ${hex}`;
      const scrubbed = scrubString(logs, 10000);
      expect(scrubbed).not.toContain(hex);
      // Both occurrences replaced (not just the first — verifies /g flag works)
      expect(scrubbed.match(/\[redacted\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it('scrubs multiple Bearer tokens in the same string', () => {
      const log = 'auth: Bearer token1234567890 retry: Bearer anothertoken9876';
      const scrubbed = scrubString(log, 10000);
      expect(scrubbed).not.toContain('token1234567890');
      expect(scrubbed).not.toContain('anothertoken9876');
      expect(scrubbed.match(/\[redacted\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });
  });

  describe('base64 detection (A1 fix: pattern added to worker)', () => {
    it('scrubs a base64-encoded string with lowercase letters and digits', () => {
      // Typical base64-encoded 32-byte value (has both lowercase and digits)
      const key = 'MCowBQYDK2VwAyEAfakePublicKeyData12345678=';
      const log = `public key: ${key}`;
      const scrubbed = scrubString(log, 10000);
      expect(scrubbed).not.toContain(key);
    });

    it('does NOT scrub a short all-uppercase string', () => {
      // All-caps, no lowercase letter — lookahead excludes it
      const log = 'STATUS: DISCONNECTED_TIMEOUT';
      const scrubbed = scrubString(log, 10000);
      expect(scrubbed).toBe(log);
    });
  });
});
