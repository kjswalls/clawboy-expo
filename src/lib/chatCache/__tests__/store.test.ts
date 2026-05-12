import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock expo-file-system before importing the module under test
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  moveAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

// Mock chatCache/crypto so we control seal/open without real AES
jest.mock('../crypto', () => ({
  sealBytes: jest.fn(),
  openBytes: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import * as crypto from '../crypto';
import { readCachedSession, writeCachedSession, deleteCachedSession } from '../store';
import type { CachedSessionBlob } from '../types';

const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

const MIN_MESSAGE = {
  id: 'msg-1',
  role: 'user' as const,
  content: 'hello',
  timestamp: '2025-01-01T00:00:00.000Z',
};

const SAMPLE_BLOB: CachedSessionBlob = {
  version: 4,
  profileId: 'prof-1',
  sessionKey: 'sess-1',
  updatedAt: 1_700_000_000_000,
  messages: [MIN_MESSAGE],
  drafts: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: directory always exists (avoids makeDirectoryAsync call in most tests)
  (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: false });
  (mockFileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
  (mockFileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
  (mockFileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  (mockFileSystem.moveAsync as jest.Mock).mockResolvedValue(undefined);
});

describe('readCachedSession', () => {
  it('returns null when file does not exist', async () => {
    (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    const result = await readCachedSession('prof-1');
    expect(result).toBeNull();
  });

  it('returns null when openBytes returns null (decryption failed)', async () => {
    (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('dGVzdA=='); // base64 "test"
    (mockCrypto.openBytes as jest.Mock).mockResolvedValue(null);
    const result = await readCachedSession('prof-1');
    expect(result).toBeNull();
  });

  it('returns parsed blob when file exists and decryption succeeds', async () => {
    (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

    const json = JSON.stringify(SAMPLE_BLOB);
    const encoded = new TextEncoder().encode(json);
    // Store some sealed bytes (we'll mock openBytes to return the plaintext directly)
    const fakeSealed = new Uint8Array([1, 2, 3]);
    // base64 of fakeSealed
    const b64 = btoa(String.fromCharCode(...fakeSealed));

    (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(b64);
    (mockCrypto.openBytes as jest.Mock).mockResolvedValue(encoded);

    const result = await readCachedSession('prof-1');
    expect(result).not.toBeNull();
    expect(result!.profileId).toBe('prof-1');
    expect(result!.messages).toHaveLength(1);
  });
});

describe('writeCachedSession', () => {
  it('creates cache dir if it does not exist', async () => {
    // First getInfoAsync returns false (dir missing), second returns true (file)
    (mockFileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValue({ exists: true });
    (mockCrypto.sealBytes as jest.Mock).mockResolvedValue(new Uint8Array([0xab, 0xcd]));

    await writeCachedSession('prof-1', SAMPLE_BLOB);

    expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      expect.stringContaining('chatcache'),
      { intermediates: true },
    );
  });

  it('writes sealed bytes as base64 to a temp file then moves', async () => {
    (mockCrypto.sealBytes as jest.Mock).mockResolvedValue(new Uint8Array([0x01, 0x02]));

    await writeCachedSession('prof-1', SAMPLE_BLOB);

    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringContaining('.enc.tmp'),
      expect.any(String),
      { encoding: 'base64' },
    );
    expect(mockFileSystem.moveAsync).toHaveBeenCalled();
  });
});

describe('deleteCachedSession', () => {
  it('calls deleteAsync for the final file and temp file', async () => {
    await deleteCachedSession('prof-1');

    const calls = (mockFileSystem.deleteAsync as jest.Mock).mock.calls;
    const paths = calls.map((c: unknown[]) => c[0] as string);
    expect(paths.some((p) => p.endsWith('.enc'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.enc.tmp'))).toBe(true);
  });
});
