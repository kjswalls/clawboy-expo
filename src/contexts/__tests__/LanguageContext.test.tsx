/**
 * LanguageContext — unit tests.
 *
 * Covers:
 * - Default to system language on first launch
 * - AsyncStorage persistence round-trip (setLanguage → store → hydrate)
 * - AppState 'active' event triggers language re-detection when pref = 'system'
 * - Explicit language preference ('en' / 'zh-CN') bypasses OS locale
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mock expo-localization ─────────────────────────────────────────────────

let mockLanguageTag = 'en-US';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: mockLanguageTag }],
}));

// ── Mock @/i18n ────────────────────────────────────────────────────────────

const mockChangeLanguage = jest.fn<(lang: string) => Promise<void>>().mockResolvedValue(undefined);
let mockCurrentLanguage = 'en';

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    get language() { return mockCurrentLanguage; },
    changeLanguage: (...args: unknown[]) => mockChangeLanguage(...args),
  },
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { LanguageProvider, useLanguage } from '../LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockAppState = AppState as jest.Mocked<typeof AppState>;

// ── Helper ─────────────────────────────────────────────────────────────────

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <LanguageProvider>{children}</LanguageProvider>;
  };
}

// ──────────────────────────────────────────────────────────────────────────

describe('LanguageContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguageTag = 'en-US';
    mockCurrentLanguage = 'en';
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  it('defaults to system language (en) when no stored preference', async () => {
    const { result } = renderHook(() => useLanguage(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.language).toBe('system');
    expect(result.current.resolvedLanguage).toBe('en');
  });

  it('resolves to zh-CN when system locale is zh-CN', async () => {
    mockLanguageTag = 'zh-CN';
    const { result } = renderHook(() => useLanguage(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.resolvedLanguage).toBe('zh-CN');
  });

  it('hydrates stored "zh-CN" preference on mount', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === 'clawboy-language-v1') return 'zh-CN';
      return null;
    });

    const { result } = renderHook(() => useLanguage(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.language).toBe('zh-CN');
    expect(result.current.resolvedLanguage).toBe('zh-CN');
    expect(mockChangeLanguage).toHaveBeenCalledWith('zh-CN');
  });

  it('setLanguage persists to AsyncStorage and updates i18n', async () => {
    const { result } = renderHook(() => useLanguage(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});

    act(() => {
      result.current.setLanguage('zh-CN');
    });

    expect(result.current.language).toBe('zh-CN');
    expect(result.current.resolvedLanguage).toBe('zh-CN');
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('clawboy-language-v1', 'zh-CN');
    expect(mockChangeLanguage).toHaveBeenCalledWith('zh-CN');
  });

  it('re-detects system language on AppState active when pref is "system"', async () => {
    let appStateHandler: ((state: string) => void) | null = null;
    mockAppState.addEventListener.mockImplementation((_event, handler) => {
      appStateHandler = handler as (state: string) => void;
      return { remove: jest.fn() };
    });

    mockLanguageTag = 'zh-CN';
    mockCurrentLanguage = 'en';

    const { result } = renderHook(() => useLanguage(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});

    // Simulate app coming back to foreground with a different system locale.
    act(() => {
      appStateHandler?.('active');
    });

    expect(mockChangeLanguage).toHaveBeenCalledWith('zh-CN');
    expect(result.current.resolvedLanguage).toBe('zh-CN');
  });

  it('does not re-detect on AppState active when pref is explicit (not system)', async () => {
    let appStateHandler: ((state: string) => void) | null = null;
    mockAppState.addEventListener.mockImplementation((_event, handler) => {
      appStateHandler = handler as (state: string) => void;
      return { remove: jest.fn() };
    });

    const { result } = renderHook(() => useLanguage(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});

    act(() => {
      result.current.setLanguage('en');
    });

    mockChangeLanguage.mockClear();
    act(() => {
      appStateHandler?.('active');
    });

    // No re-detection when language is explicitly set.
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });
});
