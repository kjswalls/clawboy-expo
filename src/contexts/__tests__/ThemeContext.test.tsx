/**
 * ThemeContext — unit tests.
 *
 * Covers:
 * - V1→V4 theme key migration logic
 * - System scheme resolution (Appearance.getColorScheme() mock)
 * - setThemeMode persists and emits event
 * - AsyncStorage round-trip (persistence + hydration)
 * - multiRemove of legacy keys after migration
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mock emitThemeToggled ──────────────────────────────────────────────────

const mockEmitThemeToggled = jest.fn<() => void>();

jest.mock('@/badges/events', () => ({
  emitThemeToggled: (...args: unknown[]) => mockEmitThemeToggled(...args),
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { ThemeProvider, useThemeContext } from '../ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockUseColorScheme = useColorScheme as jest.MockedFunction<() => string | null | undefined>;

// ── Helper ─────────────────────────────────────────────────────────────────

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <ThemeProvider>{children}</ThemeProvider>;
  };
}

// ──────────────────────────────────────────────────────────────────────────

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColorScheme.mockReturnValue('dark');
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.multiRemove.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
  });

  it('defaults to system mode, dark scheme, and tower dark palette when no stored preference', async () => {
    const { result } = renderHook(() => useThemeContext(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.themeMode).toBe('system');
    expect(result.current.resolvedScheme).toBe('dark');
    expect(result.current.darkVariant).toBe('tower');
    expect(result.current.lightVariant).toBe('default');
  });

  it('resolves to light scheme when system reports light', async () => {
    mockUseColorScheme.mockReturnValue('light');
    const { result } = renderHook(() => useThemeContext(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.resolvedScheme).toBe('light');
  });

  it('defaults to dark when system scheme is null (no OS preference)', async () => {
    mockUseColorScheme.mockReturnValue(null);
    const { result } = renderHook(() => useThemeContext(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.resolvedScheme).toBe('dark');
  });

  it('hydrates from v4 storage on mount', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === 'clawboy-theme-v4') {
        return JSON.stringify({ mode: 'light', darkVariant: 'orion', lightVariant: 'polaris', density: 'compact' });
      }
      return null;
    });

    const { result } = renderHook(() => useThemeContext(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.themeMode).toBe('light');
    expect(result.current.darkVariant).toBe('orion');
    expect(result.current.lightVariant).toBe('polaris');
    expect(result.current.density).toBe('compact');
  });

  it('migrates v1 "darkBlue" → cygnus variant and writes v4', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === 'clawboy-theme-v4') return null;
      if (key === 'clawboy-theme-v3') return null;
      if (key === 'clawboy-theme-v2') return null;
      if (key === 'clawboy-theme-v1') return 'darkBlue';
      return null;
    });

    const { result } = renderHook(() => useThemeContext(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.themeMode).toBe('dark');
    expect(result.current.darkVariant).toBe('cygnus');
    // Should write the migrated value to v4.
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      'clawboy-theme-v4',
      expect.stringContaining('"darkVariant":"cygnus"'),
    );
    // Should clean up the v1 legacy key.
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('clawboy-theme-v1');
  });

  it('migrates v3 → v4 and removes legacy keys', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === 'clawboy-theme-v4') return null;
      if (key === 'clawboy-theme-v3') {
        return JSON.stringify({ mode: 'dark', darkVariant: 'nebula', lightVariant: 'default' });
      }
      return null;
    });

    const { result } = renderHook(() => useThemeContext(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});
    expect(result.current.themeMode).toBe('dark');
    expect(result.current.darkVariant).toBe('nebula');
    // Should remove v1, v2, v3 keys after migrating.
    expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith(
      expect.arrayContaining(['clawboy-theme-v1', 'clawboy-theme-v2', 'clawboy-theme-v3']),
    );
  });

  it('setThemeMode persists to v4 and emits theme toggled event', async () => {
    const { result } = renderHook(() => useThemeContext(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {});

    act(() => {
      result.current.setThemeMode('light');
    });

    expect(result.current.themeMode).toBe('light');
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      'clawboy-theme-v4',
      expect.stringContaining('"mode":"light"'),
    );
    expect(mockEmitThemeToggled).toHaveBeenCalled();
  });
});
