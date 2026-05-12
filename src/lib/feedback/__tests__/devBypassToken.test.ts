import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Hoisted mock for expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { ClawError } from '@/lib/errors';
import {
  getDevBypassToken,
  setDevBypassToken,
  clearDevBypassToken,
  getDevBypassTokenStatus,
} from '../devBypassToken';

function getSecureStoreMock() {
  return jest.requireMock('expo-secure-store') as {
    getItemAsync: jest.Mock;
    setItemAsync: jest.Mock;
    deleteItemAsync: jest.Mock;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDevBypassToken', () => {
  it('returns null when SecureStore has no value', async () => {
    getSecureStoreMock().getItemAsync.mockResolvedValue(null);
    expect(await getDevBypassToken()).toBeNull();
  });

  it('returns null for a string shorter than 16 characters', async () => {
    getSecureStoreMock().getItemAsync.mockResolvedValue('tooshort'); // 8 chars
    expect(await getDevBypassToken()).toBeNull();
  });

  it('returns null for exactly 15-character string', async () => {
    getSecureStoreMock().getItemAsync.mockResolvedValue('123456789012345'); // 15 chars
    expect(await getDevBypassToken()).toBeNull();
  });

  it('returns trimmed string for a valid token (16+ chars)', async () => {
    getSecureStoreMock().getItemAsync.mockResolvedValue('  valid-token-1234567890  ');
    const result = await getDevBypassToken();
    expect(result).toBe('valid-token-1234567890');
  });

  it('returns exactly 16-character token', async () => {
    const token = '1234567890123456'; // exactly 16 chars
    getSecureStoreMock().getItemAsync.mockResolvedValue(token);
    expect(await getDevBypassToken()).toBe(token);
  });
});

describe('setDevBypassToken', () => {
  it('throws ClawError with feedback_token_empty for empty string', async () => {
    await expect(setDevBypassToken('')).rejects.toMatchObject({
      code: 'feedback_token_empty',
    });
  });

  it('throws ClawError with feedback_token_empty for whitespace-only string', async () => {
    await expect(setDevBypassToken('   ')).rejects.toMatchObject({
      code: 'feedback_token_empty',
    });
  });

  it('throws ClawError with feedback_token_too_short for 15-char string', async () => {
    await expect(setDevBypassToken('123456789012345')).rejects.toMatchObject({
      code: 'feedback_token_too_short',
    });
  });

  it('throws ClawError for string that trims to less than 16 chars', async () => {
    await expect(setDevBypassToken('   123456789012345   ')).rejects.toMatchObject({
      code: 'feedback_token_too_short',
    });
  });

  it('calls setItemAsync with trimmed value for valid token (16+ chars)', async () => {
    getSecureStoreMock().setItemAsync.mockResolvedValue(undefined);
    const token = '  abcdefghijklmnop  '; // 16 chars after trim
    await setDevBypassToken(token);
    expect(getSecureStoreMock().setItemAsync).toHaveBeenCalledWith(
      'clawboy.feedbackDevBypassToken',
      'abcdefghijklmnop',
    );
  });

  it('throws a ClawError instance', async () => {
    const error = await setDevBypassToken('short').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClawError);
  });
});

describe('clearDevBypassToken', () => {
  it('calls deleteItemAsync', async () => {
    getSecureStoreMock().deleteItemAsync.mockResolvedValue(undefined);
    await clearDevBypassToken();
    expect(getSecureStoreMock().deleteItemAsync).toHaveBeenCalledWith(
      'clawboy.feedbackDevBypassToken',
    );
  });

  it('does not throw when deleteItemAsync rejects', async () => {
    getSecureStoreMock().deleteItemAsync.mockRejectedValue(new Error('not found'));
    await expect(clearDevBypassToken()).resolves.toBeUndefined();
  });
});

describe('getDevBypassTokenStatus', () => {
  it('returns { set: false, preview: null } when no token', async () => {
    getSecureStoreMock().getItemAsync.mockResolvedValue(null);
    const status = await getDevBypassTokenStatus();
    expect(status).toEqual({ set: false, preview: null });
  });

  it('returns { set: true, preview: "abcd…wxyz" } for token > 8 chars', async () => {
    getSecureStoreMock().getItemAsync.mockResolvedValue('abcdefghijklmnopwxyz');
    const status = await getDevBypassTokenStatus();
    expect(status.set).toBe(true);
    expect(status.preview).toBe('abcd\u2026wxyz');
  });

  it('returns correct preview for a 26-char token', async () => {
    getSecureStoreMock().getItemAsync.mockResolvedValue('abcdefghijklmnopqrstuvwxyz');
    const status = await getDevBypassTokenStatus();
    expect(status.set).toBe(true);
    // First 4 + … + last 4
    expect(status.preview).toBe('abcd\u2026wxyz');
  });
});
