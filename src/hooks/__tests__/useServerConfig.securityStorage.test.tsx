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
jest.mock('@/lib/demo/demoStorage', () => ({ clearDemoStorage: jest.fn().mockResolvedValue(undefined) }));
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

describe('useServerConfig security storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ServerConfigProvider>{children}</ServerConfigProvider>
  );

  it('persists profile security in SecureStore and strips it from AsyncStorage', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as {
      getItem: jest.Mock;
      setItem: jest.Mock;
    };
    const SecureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
      setItemAsync: jest.Mock;
    };
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue(undefined);
    SecureStore.getItemAsync.mockResolvedValue(null);
    SecureStore.setItemAsync.mockResolvedValue(undefined);

    const { result } = renderHook(() => useServerConfig(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.addProfile({
        name: 'Primary',
        url: 'wss://gateway.test',
        isActive: true,
        authToken: 'token-abc',
        security: {
          pinnedSpkiSha256: ['aa'.repeat(32)],
          firstSeenSpkiSha256: 'bb'.repeat(32),
          firstSeenAt: 1234,
        },
      });
    });

    const asyncWrite = AsyncStorage.setItem.mock.calls.find(
      (call: unknown[]) => call[0] === 'clawboy-server-profiles-v1'
    );
    expect(asyncWrite).toBeDefined();
    expect(asyncWrite?.[1]).not.toContain('pinnedSpkiSha256');
    expect(asyncWrite?.[1]).not.toContain('firstSeenSpkiSha256');

    const securityWrite = SecureStore.setItemAsync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && (call[0] as string).startsWith('clawboy-profile-security.')
    );
    expect(securityWrite).toBeDefined();
    expect(securityWrite?.[1]).toContain('pinnedSpkiSha256');
  });

  it('migrates legacy security data out of AsyncStorage on hydration', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as {
      getItem: jest.Mock;
      setItem: jest.Mock;
    };
    const SecureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
      setItemAsync: jest.Mock;
    };

    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify([
        {
          id: 'prof_legacy',
          name: 'Legacy',
          url: 'wss://legacy.test',
          isActive: true,
          security: {
            pinnedSpkiSha256: ['cc'.repeat(32)],
            firstSeenSpkiSha256: 'dd'.repeat(32),
          },
        },
      ])
    );
    AsyncStorage.setItem.mockResolvedValue(undefined);
    SecureStore.getItemAsync.mockResolvedValue(null);
    SecureStore.setItemAsync.mockResolvedValue(undefined);

    renderHook(() => useServerConfig(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const migratedWrite = SecureStore.setItemAsync.mock.calls.find(
      (call: unknown[]) => call[0] === 'clawboy-profile-security.prof_legacy'
    );
    expect(migratedWrite).toBeDefined();
    expect(migratedWrite?.[1]).toContain('pinnedSpkiSha256');

    const sanitizedWrite = AsyncStorage.setItem.mock.calls.find(
      (call: unknown[]) => call[0] === 'clawboy-server-profiles-v1'
    );
    expect(sanitizedWrite).toBeDefined();
    expect(sanitizedWrite?.[1]).not.toContain('pinnedSpkiSha256');
  });
});
