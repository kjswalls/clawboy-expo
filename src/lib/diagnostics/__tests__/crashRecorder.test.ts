/**
 * Tests for crashRecorder.ts — encrypt-then-store / decrypt-then-read cycle.
 *
 * Mocks:
 *  - AsyncStorage: in-memory store so we can inspect written values.
 *  - sealBytes / openBytes: passthrough (XOR with 0xFF) to avoid
 *    SecureStore / expo-crypto native dependencies.
 *  - appMeta constants: fixed values so tests are deterministic.
 */

// ── AsyncStorage mock (in-memory) ────────────────────────────────────────────

const asyncStorageStore: Record<string, string | null> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(asyncStorageStore[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    asyncStorageStore[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    delete asyncStorageStore[key];
    return Promise.resolve();
  }),
}));

// ── crypto mock — trivial invertible XOR so round-trip works without native ──

jest.mock('@/lib/chatCache/crypto', () => ({
  sealBytes: jest.fn(async (plain: Uint8Array) => {
    // XOR each byte with 0xFF as a trivial bijection
    const out = new Uint8Array(plain.length);
    for (let i = 0; i < plain.length; i++) out[i] = plain[i]! ^ 0xff;
    return out;
  }),
  openBytes: jest.fn(async (sealed: Uint8Array) => {
    if (sealed.length === 0) return null;
    const out = new Uint8Array(sealed.length);
    for (let i = 0; i < sealed.length; i++) out[i] = sealed[i]! ^ 0xff;
    return out;
  }),
}));

// ── appMeta mock ──────────────────────────────────────────────────────────────

jest.mock('@/lib/appMeta', () => ({
  APP_VERSION: '1.2.3',
  BUILD_NUMBER: '42',
  UPDATE_ID: 'test-update-id',
}));

// ── Import SUT AFTER mocks are set up ────────────────────────────────────────

import { recordCrash, readLastCrash, clearLastCrash } from '../crashRecorder';

// ── Helpers ───────────────────────────────────────────────────────────────────

function clearStore() {
  for (const k of Object.keys(asyncStorageStore)) delete asyncStorageStore[k];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearStore();
  jest.clearAllMocks();
});

describe('recordCrash → readLastCrash round-trip', () => {
  it('stores and retrieves a basic crash record', async () => {
    const err = new TypeError('cannot read prop x of undefined');
    await recordCrash({ error: err });

    const record = await readLastCrash();

    expect(record).not.toBeNull();
    expect(record!.name).toBe('TypeError');
    expect(record!.message).toContain('cannot read prop x');
    expect(record!.appVersion).toBe('1.2.3');
    expect(record!.buildNumber).toBe('42');
    expect(record!.updateId).toBe('test-update-id');
  });

  it('preserves optional fields: componentStack and route', async () => {
    const err = new Error('oh no');
    await recordCrash({
      error: err,
      componentStack: '\n    at App\n    at ErrorBoundary',
      route: '/chat',
    });

    const record = await readLastCrash();

    expect(record!.componentStack).toBe('\n    at App\n    at ErrorBoundary');
    expect(record!.route).toBe('/chat');
  });

  it('scrubs a URL from the error message', async () => {
    const err = new Error('fetch failed for https://secret.gateway.example.com/api?token=abc123');
    await recordCrash({ error: err });

    const record = await readLastCrash();

    expect(record!.message).not.toContain('https://');
    expect(record!.message).not.toContain('secret.gateway');
    expect(record!.message).toContain('[redacted]');
  });

  it('returns null when no record has been stored', async () => {
    const record = await readLastCrash();
    expect(record).toBeNull();
  });
});

describe('readLastCrash — expiry and corruption', () => {
  it('returns null and clears storage when record is older than 7 days', async () => {
    const err = new Error('old crash');
    await recordCrash({ error: err });

    // Advance time by 8 days
    const realDateNow = Date.now;
    const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
    Date.now = () => realDateNow() + EIGHT_DAYS_MS;

    try {
      const record = await readLastCrash();
      expect(record).toBeNull();
    } finally {
      Date.now = realDateNow;
    }

    // Storage should have been cleared
    const record2 = await readLastCrash();
    expect(record2).toBeNull();
  });

  it('returns null on corrupt hex (odd length)', async () => {
    asyncStorageStore['clawboy.lastCrash.v1'] = 'abc'; // odd length hex
    const record = await readLastCrash();
    expect(record).toBeNull();
  });

  it('returns null when JSON parses but fails type guard (missing fields)', async () => {
    // Manually craft a sealed record that decrypts to invalid JSON structure
    const bad = JSON.stringify({ ts: Date.now(), name: 'Error' }); // missing required fields
    const plain = new TextEncoder().encode(bad);
    const xored = new Uint8Array(plain.length);
    for (let i = 0; i < plain.length; i++) xored[i] = plain[i]! ^ 0xff;

    // Convert to hex
    let hex = '';
    for (const b of xored) hex += b.toString(16).padStart(2, '0');
    asyncStorageStore['clawboy.lastCrash.v1'] = hex;

    const record = await readLastCrash();
    expect(record).toBeNull();
  });
});

describe('clearLastCrash', () => {
  it('removes the record so subsequent reads return null', async () => {
    await recordCrash({ error: new Error('test') });
    expect(await readLastCrash()).not.toBeNull();

    await clearLastCrash();
    expect(await readLastCrash()).toBeNull();
  });
});

describe('recordCrash — swallows errors', () => {
  it('does not throw if AsyncStorage.setItem rejects', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    // Should not throw
    await expect(recordCrash({ error: new Error('boom') })).resolves.toBeUndefined();
  });
});
