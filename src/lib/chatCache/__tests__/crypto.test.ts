import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// These jest.mock calls are hoisted by babel-jest before any imports,
// so the factories run before crypto.ts is imported.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
}));

import { sealBytes, openBytes } from '../crypto';

// Fixed 32-byte key for predictable tests
const FIXED_KEY = new Uint8Array(32).fill(0xab);
const FIXED_KEY_HEX = Array.from(FIXED_KEY)
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

// Fixed 12-byte IV (IV_LENGTH = 12)
const FIXED_IV = new Uint8Array(12).fill(0xcd);

function getSecureStoreMock() {
  return jest.requireMock('expo-secure-store') as {
    getItemAsync: jest.Mock;
    setItemAsync: jest.Mock;
    deleteItemAsync: jest.Mock;
  };
}

function getExpoCryptoMock() {
  return jest.requireMock('expo-crypto') as {
    getRandomBytesAsync: jest.Mock;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: key exists in SecureStore
  getSecureStoreMock().getItemAsync.mockResolvedValue(FIXED_KEY_HEX);
  getSecureStoreMock().setItemAsync.mockResolvedValue(undefined);
  // IV: return fixed 12 bytes
  getExpoCryptoMock().getRandomBytesAsync.mockResolvedValue(FIXED_IV);
});

describe('sealBytes / openBytes', () => {
  describe('round-trip', () => {
    it('key creation path: getItemAsync returns null first, creates key, then returns stored key', async () => {
      // First call to getItemAsync (in getOrCreateAes256Key): key not present → creates it
      // Second call (in getExistingAes256Key): returns stored key
      getSecureStoreMock().getItemAsync
        .mockResolvedValueOnce(null) // key not found → create
        .mockResolvedValueOnce(FIXED_KEY_HEX); // key now present

      // getRandomBytesAsync: first call is 32 bytes (key), second is 12 bytes (IV)
      getExpoCryptoMock().getRandomBytesAsync
        .mockResolvedValueOnce(FIXED_KEY)  // key bytes for creation
        .mockResolvedValueOnce(FIXED_IV);  // IV bytes for sealing

      const plaintext = new TextEncoder().encode('hello world');
      const sealed = await sealBytes(plaintext);

      const result = await openBytes(sealed);
      expect(result).not.toBeNull();
      expect(new TextDecoder().decode(result!)).toBe('hello world');
    });

    it('existing key path: round-trip preserves plaintext', async () => {
      // Both getOrCreateAes256Key and getExistingAes256Key return the same key
      getSecureStoreMock().getItemAsync.mockResolvedValue(FIXED_KEY_HEX);
      getExpoCryptoMock().getRandomBytesAsync.mockResolvedValue(FIXED_IV);

      const plaintext = new TextEncoder().encode('round trip test data');
      const sealed = await sealBytes(plaintext);
      const opened = await openBytes(sealed);

      expect(opened).not.toBeNull();
      expect(new TextDecoder().decode(opened!)).toBe('round trip test data');
    });
  });

  describe('openBytes — error cases', () => {
    it('returns null for packet shorter than 29 bytes (12 IV + 16 tag + 1 min ciphertext)', async () => {
      // 28 bytes = 12 (IV) + 16 (tag), needs strictly more than 28
      const shortPacket = new Uint8Array(28).fill(0x00);
      const result = await openBytes(shortPacket);
      expect(result).toBeNull();
    });

    it('returns null when SecureStore has no key', async () => {
      getSecureStoreMock().getItemAsync.mockResolvedValue(null);
      // Construct a packet long enough (> 28 bytes)
      const validLengthPacket = new Uint8Array(30).fill(0x00);
      const result = await openBytes(validLengthPacket);
      expect(result).toBeNull();
    });

    it('returns null when ciphertext is corrupt', async () => {
      getSecureStoreMock().getItemAsync.mockResolvedValue(FIXED_KEY_HEX);
      getExpoCryptoMock().getRandomBytesAsync.mockResolvedValue(FIXED_IV);

      // Seal real plaintext
      const plaintext = new TextEncoder().encode('corrupted test');
      const sealed = await sealBytes(plaintext);

      // Flip bytes in the ciphertext (after the 12-byte IV)
      const corrupted = new Uint8Array(sealed);
      corrupted[12] ^= 0xff;
      corrupted[13] ^= 0xff;

      const result = await openBytes(corrupted);
      expect(result).toBeNull();
    });
  });
});
