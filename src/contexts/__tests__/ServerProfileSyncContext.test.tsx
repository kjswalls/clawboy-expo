/**
 * ServerProfileSyncContext — sign-in → fetch flow tests.
 *
 * Verifies that:
 * 1. When accountStatus transitions to 'signed-in', refreshRemotePointers() is
 *    triggered and remotePointers is populated from listServerPointers().
 * 2. When signed out, remotePointers is cleared.
 * 3. refreshRemotePointers() is a no-op when signed out.
 */
import React, { useContext } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Supabase serverPointers mock ───────────────────────────────────────────

const mockListServerPointers = jest.fn<() => Promise<{ id: string; url: string; label: string }[]>>();
const mockBulkUpsertServerPointers = jest.fn<() => Promise<void>>();

jest.mock('@/lib/supabase/serverPointers', () => ({
  listServerPointers: (...args: unknown[]) => mockListServerPointers(...args),
  bulkUpsertServerPointers: (...args: unknown[]) => mockBulkUpsertServerPointers(...args),
  upsertServerPointer: jest.fn().mockResolvedValue(undefined),
  deleteServerPointerByUrl: jest.fn().mockResolvedValue(undefined),
}));

// ── useAccount mock ────────────────────────────────────────────────────────

type AccountStatus = 'signed-in' | 'signed-out' | 'unknown';
let mockAccountStatus: AccountStatus = 'signed-out';

jest.mock('@/hooks/useAccount', () => ({
  useAccount: () => ({
    status: mockAccountStatus,
    user: null,
    session: null,
    account: null,
    entitlement: null,
    signInWithApple: jest.fn(),
    signInWithGoogle: jest.fn(),
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
    deleteAccount: jest.fn(),
  }),
}));

// ── useServerConfig mock ───────────────────────────────────────────────────

let mockServerProfiles: { id: string; url: string; name: string; isActive: boolean }[] = [];

jest.mock('@/hooks/useServerConfig', () => ({
  useServerConfig: () => ({
    isHydrated: true,
    serverProfiles: mockServerProfiles,
    activeProfile: null,
    addProfile: jest.fn(),
    removeProfile: jest.fn(),
    setActiveProfile: jest.fn(),
    updateProfile: jest.fn(),
    getAuthTokenForProfile: jest.fn(),
    markConnected: jest.fn(),
    updateProfileSecurity: jest.fn(),
    enableDemoProfile: jest.fn(),
    disableDemoProfile: jest.fn(),
  }),
  ServerConfigProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import {
  ServerProfileSyncProvider,
  useServerProfileSync,
} from '../ServerProfileSyncContext';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeWrapper(status: AccountStatus, profiles: typeof mockServerProfiles = []) {
  mockAccountStatus = status;
  mockServerProfiles = profiles;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <ServerProfileSyncProvider>{children}</ServerProfileSyncProvider>;
  };
}

// ──────────────────────────────────────────────────────────────────────────

describe('ServerProfileSyncContext', () => {
  beforeEach(() => {
    mockListServerPointers.mockClear();
    mockBulkUpsertServerPointers.mockClear();
    mockListServerPointers.mockResolvedValue([]);
    mockBulkUpsertServerPointers.mockResolvedValue(undefined);
    mockAccountStatus = 'signed-out';
    mockServerProfiles = [];
  });

  it('starts with empty remotePointers when signed out', () => {
    const { result } = renderHook(() => useServerProfileSync(), {
      wrapper: makeWrapper('signed-out'),
    });
    expect(result.current.remotePointers).toEqual([]);
    expect(result.current.isFetchingPointers).toBe(false);
  });

  it('populates remotePointers on sign-in when cloud has rows', async () => {
    const cloudRows = [{ id: 'uuid-1', url: 'wss://myserver.example.com', label: 'My Server' }];
    mockListServerPointers.mockResolvedValue(cloudRows);

    const { result } = renderHook(() => useServerProfileSync(), {
      wrapper: makeWrapper('signed-in'),
    });

    // Wait for the async sign-in effect to complete.
    await act(async () => {});

    expect(mockListServerPointers).toHaveBeenCalledTimes(1);
    expect(result.current.remotePointers).toEqual(cloudRows);
  });

  it('filters out local profiles from remotePointers', async () => {
    const localProfile = { id: 'p1', url: 'wss://already-local.example.com', name: 'Local', isActive: true };
    const cloudRows = [
      { id: 'uuid-1', url: 'wss://already-local.example.com', label: 'Local' },
      { id: 'uuid-2', url: 'wss://remote-only.example.com', label: 'Remote' },
    ];
    mockListServerPointers.mockResolvedValue(cloudRows);

    const { result } = renderHook(() => useServerProfileSync(), {
      wrapper: makeWrapper('signed-in', [localProfile]),
    });

    await act(async () => {});

    // Only the remote-only row (not already in local profiles) should appear.
    expect(result.current.remotePointers).toEqual([
      { id: 'uuid-2', url: 'wss://remote-only.example.com', label: 'Remote' },
    ]);
  });

  it('clears remotePointers on sign-out', async () => {
    const cloudRows = [{ id: 'uuid-1', url: 'wss://myserver.example.com', label: 'My Server' }];
    mockListServerPointers.mockResolvedValue(cloudRows);

    // Start signed in so remotePointers are populated.
    mockAccountStatus = 'signed-in';
    const { result, rerender } = renderHook(() => useServerProfileSync(), {
      wrapper: makeWrapper('signed-in'),
    });
    await act(async () => {});
    expect(result.current.remotePointers).toHaveLength(1);

    // Sign out — remotePointers should be cleared.
    mockAccountStatus = 'signed-out';
    await act(async () => {
      rerender({});
    });
    expect(result.current.remotePointers).toEqual([]);
  });

  it('refreshRemotePointers() is a no-op when signed out', async () => {
    const { result } = renderHook(() => useServerProfileSync(), {
      wrapper: makeWrapper('signed-out'),
    });

    await act(async () => {
      await result.current.refreshRemotePointers();
    });

    expect(mockListServerPointers).not.toHaveBeenCalled();
    expect(result.current.remotePointers).toEqual([]);
  });

  it('seeds local profiles to cloud on sign-in', async () => {
    const localProfile = {
      id: 'prof_abc',
      url: 'wss://my-gw.example.com',
      name: 'My GW',
      isActive: true,
    };
    mockListServerPointers.mockResolvedValue([]);

    const { result } = renderHook(() => useServerProfileSync(), {
      wrapper: makeWrapper('signed-in', [localProfile]),
    });
    await act(async () => {});

    expect(mockBulkUpsertServerPointers).toHaveBeenCalledWith([
      { url: 'wss://my-gw.example.com', label: 'My GW' },
    ]);
    // No remote-only pointers (cloud returned empty after seed).
    expect(result.current.remotePointers).toEqual([]);
  });
});
