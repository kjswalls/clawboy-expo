/**
 * ConventionInstallContext — unit tests.
 *
 * Coverage:
 *  - Hydration migration: 'ask' → 'primer', unknown enum → 'primer'
 *  - markOnboarded idempotency (conventions-005 side-effect: persist not called twice)
 *  - Mode-change re-evaluation (conventions-002): cached fallback/global_off or
 *    fallback/primer_only is treated as stale when globalMode switches to 'auto'
 *  - 'primer' mode stores reason: 'primer_only' (conventions-003)
 *  - isInstalling returns false when no install is in flight (conventions-004)
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── AsyncStorage mock ──────────────────────────────────────────────────────

const mockGetItem = jest.fn<() => Promise<string | null>>().mockResolvedValue(null);
const mockSetItem = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));

// ── ensureAgentsMdInstalled mock ───────────────────────────────────────────

type InstallMockResult =
  | { ok: true; mode: 'installed' | 'noop' }
  | { ok: false; reason: string; message: string };
const mockEnsureInstalled = jest.fn<() => Promise<InstallMockResult>>();

jest.mock('@/lib/openclaw/installConventions', () => ({
  ensureAgentsMdInstalled: (...args: unknown[]) => mockEnsureInstalled(...args),
  uninstallAgentsMd: jest.fn().mockResolvedValue({ ok: true }),
}));

// ── ConnectionContext mock — provides a non-null client ────────────────────

const mockClient = {};

jest.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({
    connectionState: { status: 'connected', serverVersion: '1.0' },
    client: { current: mockClient },
  }),
  ConnectionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── useServerConfig mock ───────────────────────────────────────────────────

jest.mock('@/hooks/useServerConfig', () => ({
  useServerConfig: () => ({
    activeProfile: { id: 'p1', name: 'Test', url: 'wss://test.local', isActive: true },
  }),
}));

// ── Subject under test ─────────────────────────────────────────────────────

import {
  ConventionInstallProvider,
  useConventionInstall,
  type AgentInstallStatus,
} from '@/contexts/ConventionInstallContext';
import { CONVENTION_VERSION } from '@/lib/openclaw/clientContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConventionInstallProvider>{children}</ConventionInstallProvider>;
}

function storedState(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    globalMode: 'primer',
    hasOnboarded: true,
    byAgent: {},
    ...overrides,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ConventionInstallContext', () => {
  beforeEach(() => {
    mockGetItem.mockReset().mockResolvedValue(null);
    mockSetItem.mockReset().mockResolvedValue(undefined);
    mockEnsureInstalled.mockReset();
  });

  // ── Hydration migration ──────────────────────────────────────────────────

  describe('hydration migration', () => {
    it("migrates 'ask' → 'primer' on hydration", async () => {
      mockGetItem.mockResolvedValueOnce(storedState({ globalMode: 'ask', hasOnboarded: false }));
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));
      expect(result.current.globalMode).toBe('primer');
    });

    it('migrates unknown enum value → primer on hydration', async () => {
      mockGetItem.mockResolvedValueOnce(storedState({ globalMode: 'legacy_unknown' }));
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));
      expect(result.current.globalMode).toBe('primer');
    });

    it('preserves known enum values unchanged', async () => {
      for (const mode of ['auto', 'primer', 'off'] as const) {
        mockGetItem.mockResolvedValueOnce(storedState({ globalMode: mode }));
        const { result, unmount } = renderHook(() => useConventionInstall(), { wrapper });
        await waitFor(() => expect(result.current.isHydrated).toBe(true));
        expect(result.current.globalMode).toBe(mode);
        unmount();
        mockGetItem.mockReset().mockResolvedValue(null);
      }
    });

    it('uses default state when storage returns null', async () => {
      mockGetItem.mockResolvedValueOnce(null);
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));
      expect(result.current.globalMode).toBe('primer');
      expect(result.current.hasOnboarded).toBe(true);
    });

    it('recovers gracefully from corrupt JSON in storage', async () => {
      mockGetItem.mockResolvedValueOnce('{not valid json}');
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));
      expect(result.current.globalMode).toBe('primer');
    });
  });

  // ── markOnboarded idempotency ──────────────────────────────────────────

  describe('markOnboarded', () => {
    it('sets hasOnboarded and persists', async () => {
      mockGetItem.mockResolvedValueOnce(storedState({ hasOnboarded: false }));
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));
      expect(result.current.hasOnboarded).toBe(false);

      act(() => { result.current.markOnboarded(); });

      expect(result.current.hasOnboarded).toBe(true);
      expect(mockSetItem).toHaveBeenCalled();
    });

    it('is idempotent — does not call persist a second time', async () => {
      mockGetItem.mockResolvedValueOnce(storedState({ hasOnboarded: false }));
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));

      act(() => { result.current.markOnboarded(); });
      const callsAfterFirst = mockSetItem.mock.calls.length;

      act(() => { result.current.markOnboarded(); });
      expect(mockSetItem.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  // ── primer_only reason discriminant (conventions-003) ─────────────────

  describe("resolveOnFirstInteraction — primer mode stores 'primer_only'", () => {
    it("returns fallback with reason 'primer_only' in primer mode", async () => {
      mockGetItem.mockResolvedValueOnce(storedState({ globalMode: 'primer' }));
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));

      let status: AgentInstallStatus | undefined;
      await act(async () => {
        status = await result.current.resolveOnFirstInteraction('p1', 'agent-A');
      });

      expect(status).toMatchObject({ kind: 'fallback', reason: 'primer_only' });
      expect(mockEnsureInstalled).not.toHaveBeenCalled();
    });

    it("returns fallback with reason 'global_off' in off mode", async () => {
      mockGetItem.mockResolvedValueOnce(storedState({ globalMode: 'off' }));
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));

      let status: AgentInstallStatus | undefined;
      await act(async () => {
        status = await result.current.resolveOnFirstInteraction('p1', 'agent-A');
      });

      expect(status).toMatchObject({ kind: 'fallback', reason: 'global_off' });
      expect(mockEnsureInstalled).not.toHaveBeenCalled();
    });
  });

  // ── Mode-change re-evaluation (conventions-002) ──────────────────────────

  describe('mode-change re-evaluation', () => {
    it("re-evaluates cached 'primer_only' when globalMode is 'auto'", async () => {
      // State already switched to auto with stale primer_only entry for agent-A.
      mockGetItem.mockResolvedValueOnce(
        storedState({
          globalMode: 'auto',
          byAgent: {
            'p1:agent-A': { kind: 'fallback', reason: 'primer_only', since: 1000 },
          },
        }),
      );
      mockEnsureInstalled.mockResolvedValue({ ok: true, mode: 'installed' });

      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));

      await act(async () => {
        await result.current.resolveOnFirstInteraction('p1', 'agent-A');
      });

      // Install was attempted — stale cache was not returned.
      expect(mockEnsureInstalled).toHaveBeenCalledTimes(1);
      expect(result.current.getStatus('p1', 'agent-A')).toMatchObject({ kind: 'installed' });
    });

    it("re-evaluates cached 'global_off' when globalMode is 'auto'", async () => {
      mockGetItem.mockResolvedValueOnce(
        storedState({
          globalMode: 'auto',
          byAgent: {
            'p1:agent-B': { kind: 'fallback', reason: 'global_off', since: 1000 },
          },
        }),
      );
      mockEnsureInstalled.mockResolvedValue({ ok: true, mode: 'noop' });

      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));

      await act(async () => {
        await result.current.resolveOnFirstInteraction('p1', 'agent-B');
      });

      expect(mockEnsureInstalled).toHaveBeenCalledTimes(1);
    });

    it('does NOT re-evaluate an up-to-date installed entry in auto mode', async () => {
      mockGetItem.mockResolvedValueOnce(
        storedState({
          globalMode: 'auto',
          byAgent: {
            'p1:agent-C': {
              kind: 'installed',
              installedAt: 1000,
              conventionVersion: CONVENTION_VERSION,
            },
          },
        }),
      );

      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));

      let status: AgentInstallStatus | undefined;
      await act(async () => {
        status = await result.current.resolveOnFirstInteraction('p1', 'agent-C');
      });

      expect(mockEnsureInstalled).not.toHaveBeenCalled();
      expect(status).toMatchObject({ kind: 'installed' });
    });

    it('does NOT re-evaluate a declined entry even in auto mode', async () => {
      mockGetItem.mockResolvedValueOnce(
        storedState({
          globalMode: 'auto',
          byAgent: {
            'p1:agent-D': { kind: 'fallback', reason: 'declined', since: 1000 },
          },
        }),
      );

      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));

      let status: AgentInstallStatus | undefined;
      await act(async () => {
        status = await result.current.resolveOnFirstInteraction('p1', 'agent-D');
      });

      expect(mockEnsureInstalled).not.toHaveBeenCalled();
      expect(status).toMatchObject({ kind: 'fallback', reason: 'declined' });
    });
  });

  // ── isInstalling (conventions-004) ────────────────────────────────────────

  describe('isInstalling', () => {
    it('returns false for an agent with no in-flight install', async () => {
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));
      expect(result.current.isInstalling('p1', 'agent-X')).toBe(false);
    });

    it('returns false for all agents when nothing is running', async () => {
      mockGetItem.mockResolvedValueOnce(
        storedState({
          globalMode: 'auto',
          byAgent: {
            'p1:agent-Y': { kind: 'installed', installedAt: 1000, conventionVersion: CONVENTION_VERSION },
          },
        }),
      );
      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));
      expect(result.current.isInstalling('p1', 'agent-Y')).toBe(false);
      expect(result.current.isInstalling('p1', 'agent-Z')).toBe(false);
    });

    it('returns true while install is in-flight and false after completion', async () => {
      mockGetItem.mockResolvedValueOnce(storedState({ globalMode: 'auto' }));

      let resolveInstall!: (v: InstallMockResult) => void;
      const installDeferred = new Promise<InstallMockResult>((resolve) => {
        resolveInstall = resolve;
      });
      mockEnsureInstalled.mockReturnValue(installDeferred);

      const { result } = renderHook(() => useConventionInstall(), { wrapper });
      await waitFor(() => expect(result.current.isHydrated).toBe(true));

      // Kick off the install without awaiting. The inflight entry is registered
      // synchronously before the first await in resolveOnFirstInteraction, so
      // after act flushes the setInflightCount re-render, isInstalling is true.
      act(() => {
        void result.current.resolveOnFirstInteraction('p1', 'agent-E');
      });

      await waitFor(() => expect(result.current.isInstalling('p1', 'agent-E')).toBe(true));

      // Resolve the deferred RPC promise and wait for the finally block to
      // remove the inflight entry and trigger a setInflightCount re-render.
      resolveInstall({ ok: true, mode: 'installed' });
      await waitFor(() => expect(result.current.isInstalling('p1', 'agent-E')).toBe(false));
    });
  });
});
