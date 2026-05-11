/**
 * Miniflare-based integration tests for the feedback worker.
 *
 * These tests spin up the bundled worker (dist/index.js) against an in-memory
 * KV namespace, so they can run without a real Cloudflare account.
 * GitHub API calls are intercepted via the `outboundService` mock.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.resolve(__dirname, '../dist/index.js');

// Minimal valid payload that will pass validate() but fail at GitHub
const VALID_PAYLOAD = {
  kind: 'bug',
  title: 'Test bug title',
  body: 'This is a detailed bug description for testing.',
  clientNonce: 'test-nonce-00001',
};

// Convenience: base64-encode a small JPEG (FF D8 FF E0 + padding)
// Only the magic bytes matter for verifyJpegMagicBytes().
const JPEG_MAGIC_B64 = btoa('\xFF\xD8\xFF\xE0' + '\x00'.repeat(8));

function makeMf(extraVars: Record<string, string> = {}): Miniflare {
  return new Miniflare({
    scriptPath: WORKER_SCRIPT,
    modules: true,
    kvNamespaces: { FEEDBACK_KV: 'test-kv' },
    bindings: {
      GITHUB_OWNER: 'test-owner',
      GITHUB_REPO: 'test-repo',
      APP_LABEL: 'from-app',
      GITHUB_DEFAULT_BRANCH: 'main',
      GITHUB_PAT: 'test-pat',
      ...extraVars,
    },
  });
}

async function post(mf: Miniflare, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return mf.dispatchFetch('http://localhost/v1/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ── validate() ─────────────────────────────────────────────────────────────

describe('validate()', () => {
  let mf: Miniflare;

  beforeAll(() => { mf = makeMf(); });
  afterAll(() => mf.dispose());

  it('rejects missing kind', async () => {
    const res = await post(mf, { ...VALID_PAYLOAD, kind: undefined, clientNonce: 'nonce-v1' });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('validation');
  });

  it('rejects invalid kind value', async () => {
    const res = await post(mf, { ...VALID_PAYLOAD, kind: 'complaint', clientNonce: 'nonce-v2' });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects title too short', async () => {
    const res = await post(mf, { ...VALID_PAYLOAD, title: 'Hi', clientNonce: 'nonce-v3' });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects title too long', async () => {
    const res = await post(mf, { ...VALID_PAYLOAD, title: 'x'.repeat(121), clientNonce: 'nonce-v4' });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects body too short', async () => {
    const res = await post(mf, { ...VALID_PAYLOAD, body: 'short', clientNonce: 'nonce-v5' });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects missing clientNonce', async () => {
    const res = await post(mf, { ...VALID_PAYLOAD, clientNonce: undefined });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects clientNonce shorter than 8 chars', async () => {
    const res = await post(mf, { ...VALID_PAYLOAD, clientNonce: 'short' });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects non-object body', async () => {
    const res = await mf.dispatchFetch('http://localhost/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '"just a string"',
    });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });
});

// ── validateScreenshots() ──────────────────────────────────────────────────

describe('validateScreenshots()', () => {
  let mf: Miniflare;

  beforeAll(() => { mf = makeMf(); });
  afterAll(() => mf.dispose());

  it('rejects non-JPEG magic bytes', async () => {
    // PNG magic bytes (89 50 4E 47) encoded as base64
    const pngB64 = btoa('\x89\x50\x4E\x47' + '\x00'.repeat(8));
    const res = await post(mf, {
      ...VALID_PAYLOAD,
      clientNonce: 'nonce-ss1',
      screenshots: [{ mimeType: 'image/jpeg', base64: pngB64 }],
    });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects screenshot with wrong mimeType', async () => {
    const res = await post(mf, {
      ...VALID_PAYLOAD,
      clientNonce: 'nonce-ss2',
      screenshots: [{ mimeType: 'image/png', base64: JPEG_MAGIC_B64 }],
    });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects more than 3 screenshots', async () => {
    const shots = Array.from({ length: 4 }, () => ({ mimeType: 'image/jpeg', base64: JPEG_MAGIC_B64 }));
    const res = await post(mf, {
      ...VALID_PAYLOAD,
      clientNonce: 'nonce-ss3',
      screenshots: shots,
    });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });

  it('rejects screenshots not an array', async () => {
    const res = await post(mf, {
      ...VALID_PAYLOAD,
      clientNonce: 'nonce-ss4',
      screenshots: 'not-an-array',
    });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('validation');
  });
});

// ── findLeak() ─────────────────────────────────────────────────────────────

describe('findLeak()', () => {
  let mf: Miniflare;

  beforeAll(() => { mf = makeMf(); });
  afterAll(() => mf.dispose());

  it('blocks a URL in title', async () => {
    const res = await post(mf, {
      ...VALID_PAYLOAD,
      title: 'Bug with https://secret.example.com in title',
      clientNonce: 'nonce-fl1',
    });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('leak_blocked');
  });

  it('blocks a WebSocket URL in body', async () => {
    const res = await post(mf, {
      ...VALID_PAYLOAD,
      body: 'Connecting to wss://my-server.example.com failed with an error.',
      clientNonce: 'nonce-fl2',
    });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('leak_blocked');
  });

  it('blocks a Bearer token in contact field', async () => {
    const res = await post(mf, {
      ...VALID_PAYLOAD,
      contact: 'Bearer eyJhbGciOiJIUzI1NiJ9.test1234',
      clientNonce: 'nonce-fl3',
    });
    const body = await res.json() as { ok: boolean; error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe('leak_blocked');
  });

  it('allows clean payload without leaks (will fail at GitHub = 502)', async () => {
    const res = await post(mf, { ...VALID_PAYLOAD, clientNonce: 'nonce-fl4' });
    // 502 or any non-400 is fine — it passed leak check
    expect(res.status).not.toBe(400);
  });
});

// ── Rate limiting ──────────────────────────────────────────────────────────

describe('rate limiting', () => {
  let mf: Miniflare;

  beforeAll(() => { mf = makeMf(); });
  afterAll(() => mf.dispose());

  it('blocks the 16th submission from the same IP within an hour', async () => {
    const LIMIT = 15;
    // Seed the KV directly to simulate 14 prior submissions, avoiding 14 slow
    // round-trips through the worker (each of which tries a GitHub call that 502s).
    const kv = await mf.getKVNamespace('FEEDBACK_KV');
    const now = Math.floor(Date.now() / 1000);
    // Worker reads IP from cf-connecting-ip header; use a fixed test IP.
    const TEST_IP = '192.0.2.1';
    await kv.put(
      `rl:ip:${TEST_IP}:h`,
      JSON.stringify({ count: LIMIT - 1, expiresAt: now + 3600 }),
      { expirationTtl: 3600 },
    );
    await kv.put(
      `rl:ip:${TEST_IP}:d`,
      JSON.stringify({ count: LIMIT - 1, expiresAt: now + 86400 }),
      { expirationTtl: 86400 },
    );

    const cfHeaders = { 'cf-connecting-ip': TEST_IP };

    // The first request should pass rate-limit (count goes from 14 → 15)
    const allowed = await post(mf, { ...VALID_PAYLOAD, clientNonce: 'nonce-rl-allowed' }, cfHeaders);
    expect(allowed.status).not.toBe(429);

    // The next request should be blocked (count is now 15 >= LIMIT)
    const blocked = await post(mf, { ...VALID_PAYLOAD, clientNonce: 'nonce-rl-overflow' }, cfHeaders);
    const body = await blocked.json() as { ok: boolean; error: string; retryAfter?: number };
    expect(blocked.status).toBe(429);
    expect(body.error).toBe('rate_limited');
    expect(typeof body.retryAfter).toBe('number');
  }, 15_000);

  it('bypasses rate limit with valid DEV_BYPASS_TOKEN header', async () => {
    const mfDev = makeMf({ DEV_BYPASS_TOKEN: 'valid-dev-bypass-secret-token-1234' });
    try {
      // Seed the rate-limit KV to simulate exhaustion
      const kv = await mfDev.getKVNamespace('FEEDBACK_KV');
      const now = Math.floor(Date.now() / 1000);
      const BYPASS_IP = '192.0.2.99';
      await kv.put(
        `rl:ip:${BYPASS_IP}:h`,
        JSON.stringify({ count: 99, expiresAt: now + 3600 }),
        { expirationTtl: 3600 },
      );

      const res = await post(mfDev, { ...VALID_PAYLOAD, clientNonce: 'nonce-bypass-1' }, {
        'X-Feedback-Dev-Token': 'valid-dev-bypass-secret-token-1234',
        'cf-connecting-ip': BYPASS_IP,
      });
      // Should NOT be 429 (should pass rate limit, then fail at GitHub with 502)
      expect(res.status).not.toBe(429);
    } finally {
      await mfDev.dispose();
    }
  });
});

// ── Idempotency ─────────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('returns cached result for previously seen clientNonce', async () => {
    const mf = makeMf();
    try {
      const nonce = 'idempotent-test-nonce-abc123';
      const cachedResponse = { issueUrl: 'https://github.com/test-owner/test-repo/issues/42', issueNumber: 42 };

      // Seed the nonce cache in KV
      const kv = await mf.getKVNamespace('FEEDBACK_KV');
      await kv.put(`nonce:${nonce}`, JSON.stringify(cachedResponse), { expirationTtl: 86400 });

      const res = await post(mf, { ...VALID_PAYLOAD, clientNonce: nonce });
      const body = await res.json() as { ok: boolean; issueUrl: string; issueNumber: number };
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.issueUrl).toBe(cachedResponse.issueUrl);
      expect(body.issueNumber).toBe(cachedResponse.issueNumber);
    } finally {
      await mf.dispose();
    }
  });
});
