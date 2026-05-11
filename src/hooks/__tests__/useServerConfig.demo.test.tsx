/**
 * Round-trip tests for enableDemoProfile / disableDemoProfile.
 * Covers demo-006 from the Wave 3 audit.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { ServerConfigProvider, useServerConfig } from '../useServerConfig';

jest.mock('@/hooks/useAccount', () => ({
  useAccount: () => ({ status: 'signed-out' }),
}));
jest.mock('@/badges/events', () => ({ emitProfileSwitched: jest.fn() }));
jest.mock('@/lib/chatCache', () => ({ deleteCachedSession: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/media/downloadMedia', () => ({
  cancelAllDownloads: jest.fn(),
  clearMediaCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/demo/demoStorage', () => ({
  clearDemoStorage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/supabase/serverPointers', () => ({
  deleteServerPointerByUrl: jest.fn().mockResolvedValue(undefined),
  upsertServerPointer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ServerConfigProvider>{children}</ServerConfigProvider>
);

function setupAsyncStorage(initialProfiles: unknown[] | null = null): void {
  const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as {
    getItem: jest.Mock;
    setItem: jest.Mock;
  };
  const SecureStore = jest.requireMock('expo-secure-store') as {
    getItemAsync: jest.Mock;
    setItemAsync: jest.Mock;
    deleteItemAsync: jest.Mock;
  };
  AsyncStorage.getItem.mockResolvedValue(
    initialProfiles ? JSON.stringify(initialProfiles) : null,
  );
  AsyncStorage.setItem.mockResolvedValue(undefined);
  SecureStore.getItemAsync.mockResolvedValue(null);
  SecureStore.setItemAsync.mockResolvedValue(undefined);
  SecureStore.deleteItemAsync.mockResolvedValue(undefined);
}

describe('enableDemoProfile / disableDemoProfile round-trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enableDemoProfile adds a demo profile that is active', async () => {
    setupAsyncStorage(null);

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    // Wait for hydration.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.enableDemoProfile();
    });

    const demo = result.current.serverProfiles.find((p) => p.id === '__demo__');
    expect(demo).toBeDefined();
    expect(demo?.isActive).toBe(true);
    expect(demo?.kind).toBe('demo');
    expect(result.current.activeProfile?.id).toBe('__demo__');
  });

  it('enableDemoProfile replaces any pre-existing demo profile (no duplicates)', async () => {
    setupAsyncStorage([
      { id: '__demo__', name: 'Demo', url: 'demo://local', isActive: true, kind: 'demo' },
    ]);

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.enableDemoProfile();
    });

    const demos = result.current.serverProfiles.filter((p) => p.id === '__demo__');
    expect(demos).toHaveLength(1);
  });

  it('disableDemoProfile removes the demo profile and calls clearDemoStorage', async () => {
    setupAsyncStorage([
      { id: '__demo__', name: 'Demo', url: 'demo://local', isActive: true, kind: 'demo' },
    ]);

    const { clearDemoStorage } = jest.requireMock('@/lib/demo/demoStorage') as {
      clearDemoStorage: jest.Mock;
    };

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.disableDemoProfile();
    });

    const demo = result.current.serverProfiles.find((p) => p.id === '__demo__');
    expect(demo).toBeUndefined();
    expect(clearDemoStorage).toHaveBeenCalledTimes(1);
  });

  it('disableDemoProfile activates the next profile when one exists', async () => {
    setupAsyncStorage([
      { id: 'prof_real', name: 'My Server', url: 'wss://gateway.example', isActive: false },
      { id: '__demo__', name: 'Demo', url: 'demo://local', isActive: true, kind: 'demo' },
    ]);

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.disableDemoProfile();
    });

    const remaining = result.current.serverProfiles;
    expect(remaining.find((p) => p.id === '__demo__')).toBeUndefined();
    // The remaining real profile should be active (or at least present).
    expect(remaining.find((p) => p.id === 'prof_real')).toBeDefined();
    expect(remaining.find((p) => p.id === 'prof_real')?.isActive).toBe(true);
  });
});
