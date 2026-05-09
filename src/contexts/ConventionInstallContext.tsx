/**
 * Tracks per-(profile, agent) ClawBoy convention install state.
 *
 * The convention can be delivered two ways:
 *
 *  1. Primary — managed `AGENTS.md` section installed via `agents.files.set`.
 *     Once installed, the OpenClaw runtime injects the convention into every
 *     agent prompt with no per-message overhead.
 *
 *  2. Fallback — per-session HTML-comment primer prepended to the first user
 *     message of each session. Used when AGENTS.md install is declined or
 *     fails for an agent.
 *
 * This context is the source of truth for which path is active for each
 * (profile, agent) pair, plus the global onboarding decision that drives
 * lazy-install behaviour on first interaction.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConnection } from '@/contexts/ConnectionContext';
import { useServerConfig } from '@/hooks/useServerConfig';
import { CONVENTION_VERSION } from '@/lib/openclaw/clientContext';
import {
  ensureAgentsMdInstalled,
  uninstallAgentsMd,
  type InstallResult,
  type UninstallResult,
} from '@/lib/openclaw/installConventions';

const STORAGE_KEY = 'clawboy-convention-install-v1';

/** Global decision driving auto-install behaviour. */
export type GlobalInstallMode =
  /** Primer on first message + auto-install AGENTS.md on first send. */
  | 'auto'
  /** Per-session primer only — never install AGENTS.md. */
  | 'primer'
  /** Feature fully disabled — no primer, no install. */
  | 'off';

/** Per-(profile, agent) install record. */
export type AgentInstallStatus =
  /** No record yet — onboarding logic decides whether to install. */
  | { kind: 'unknown' }
  /** Successful install. AGENTS.md contains our managed section. */
  | { kind: 'installed'; installedAt: number; conventionVersion: number }
  /** User declined or install failed; fall back to per-session primer. */
  | {
      kind: 'fallback';
      reason: 'declined' | 'install_failed' | 'global_off';
      since: number;
      /** Last error message when reason === 'install_failed'. */
      lastError?: string;
    }
  /** Hard failure (e.g. no workspace) — primer fallback also pointless. */
  | { kind: 'failed'; reason: string; since: number };

interface PersistedState {
  globalMode: GlobalInstallMode;
  hasOnboarded: boolean;
  /** Map keyed by `${profileId}:${agentId}` → status record. */
  byAgent: Record<string, AgentInstallStatus>;
}

const DEFAULT_STATE: PersistedState = {
  // Primer is the default: per-session hidden context primer on first message only.
  // Users can opt into AGENTS.md auto-install in Settings → Inline Reply Controls.
  globalMode: 'primer',
  hasOnboarded: true,
  byAgent: {},
};

function makeKey(profileId: string, agentId: string): string {
  return `${profileId}:${agentId}`;
}

export interface ConventionInstallContextValue {
  /** Has the user seen the onboarding sheet at least once on this device? */
  hasOnboarded: boolean;
  markOnboarded: () => void;

  /** Global default — drives lazy-install behaviour. */
  globalMode: GlobalInstallMode;
  setGlobalMode: (mode: GlobalInstallMode) => void;

  /**
   * Look up the install status for a specific (profile, agent) pair.
   * Returns `{ kind: 'unknown' }` when no record exists.
   */
  getStatus: (profileId: string, agentId: string) => AgentInstallStatus;

  /** Override the install status manually (e.g. after a settings action). */
  setStatus: (profileId: string, agentId: string, status: AgentInstallStatus) => void;

  /**
   * Run `ensureAgentsMdInstalled` against the *active* connection's client
   * for the given agent and persist the result. Idempotent: a successful
   * install on a freshly-installed agent returns `{ ok: true, mode: 'noop' }`.
   *
   * Caller is responsible for passing `profileId` (the active profile's id).
   */
  installAgent: (
    profileId: string,
    agentId: string,
  ) => Promise<InstallResult | { ok: false; reason: 'no_client'; message: string }>;

  /** Uninstall the managed section. Marks the agent as `fallback / declined`. */
  uninstallAgent: (
    profileId: string,
    agentId: string,
  ) => Promise<UninstallResult | { ok: false; reason: 'no_client'; message: string }>;

  /**
   * For a freshly-touched agent, decide whether to auto-install based on
   * `globalMode`. Returns the resolved status (after any side effects).
   * Used by `useChat.sendMessage` lazy-install path.
   *
   * - `auto` → kicks off install, returns `installed` on success or
   *   `fallback / install_failed` on RPC failure.
   * - `primer` / `off` → leaves status as `fallback / global_off`
   *   so the chat proceeds via the per-session primer path.
   */
  resolveOnFirstInteraction: (
    profileId: string,
    agentId: string,
  ) => Promise<AgentInstallStatus>;

  /** True until AsyncStorage hydration completes (avoids first-paint flicker). */
  isHydrated: boolean;
}

const ConventionInstallContext = createContext<ConventionInstallContextValue | null>(null);

export function ConventionInstallProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [isHydrated, setIsHydrated] = useState(false);
  // Mirror to a ref so async install flows can read the freshest state without
  // requiring a render commit between the kickoff and the read.
  const stateRef = useRef(state);
  stateRef.current = state;

  const { client: clientRef } = useConnection();
  const { activeProfile } = useServerConfig();
  // Tracks in-flight installs per agent so concurrent send calls dedupe.
  const inflightRef = useRef<Map<string, Promise<AgentInstallStatus>>>(new Map());

  // ── hydration ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedState> & { globalMode?: string };
          // Migrate: the legacy 'off' value meant "primer fallback only" —
          // that semantic is now named 'primer'. The new 'off' disables everything.
          const rawMode = parsed.globalMode;
          const migratedMode: GlobalInstallMode =
            rawMode === 'auto' || rawMode === 'primer' || rawMode === 'off'
              ? rawMode
              : rawMode === 'ask'
                // 'ask' mode removed — migrate to 'primer' (same fallback behaviour, no AGENTS.md install).
                ? 'primer'
                : rawMode === undefined
                  ? DEFAULT_STATE.globalMode
                  // Unknown / old enum value — treat as 'primer' (safest non-destructive default).
                  : 'primer';
          setState({
            globalMode: migratedMode,
            hasOnboarded: parsed.hasOnboarded ?? DEFAULT_STATE.hasOnboarded,
            byAgent: parsed.byAgent ?? {},
          });
        }
      } catch {
        // Bad JSON in storage — treat as fresh install. We deliberately do
        // NOT clear storage here; the user might want to recover the file
        // out-of-band before we overwrite it.
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── persistence ──────────────────────────────────────────────────────────
  const persist = useCallback((next: PersistedState): void => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ── public mutators ──────────────────────────────────────────────────────
  const markOnboarded = useCallback((): void => {
    setState((prev) => {
      if (prev.hasOnboarded) return prev;
      const next = { ...prev, hasOnboarded: true };
      persist(next);
      return next;
    });
  }, [persist]);

  const setGlobalMode = useCallback(
    (mode: GlobalInstallMode): void => {
      setState((prev) => {
        if (prev.globalMode === mode) return prev;
        const next = { ...prev, globalMode: mode };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const getStatus = useCallback(
    (profileId: string, agentId: string): AgentInstallStatus => {
      const k = makeKey(profileId, agentId);
      return stateRef.current.byAgent[k] ?? { kind: 'unknown' };
    },
    [],
  );

  const setStatus = useCallback(
    (profileId: string, agentId: string, status: AgentInstallStatus): void => {
      setState((prev) => {
        const k = makeKey(profileId, agentId);
        const next = {
          ...prev,
          byAgent: { ...prev.byAgent, [k]: status },
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  // ── install ──────────────────────────────────────────────────────────────
  const installAgent = useCallback(
    async (
      profileId: string,
      agentId: string,
    ): Promise<InstallResult | { ok: false; reason: 'no_client'; message: string }> => {
      const c = clientRef.current;
      if (!c) {
        return { ok: false, reason: 'no_client', message: 'No active gateway connection' };
      }
      const result = await ensureAgentsMdInstalled(c, agentId);
      if (result.ok) {
        setStatus(profileId, agentId, {
          kind: 'installed',
          installedAt: Date.now(),
          conventionVersion: CONVENTION_VERSION,
        });
      } else if (result.reason === 'no_workspace') {
        setStatus(profileId, agentId, {
          kind: 'failed',
          reason: 'no_workspace',
          since: Date.now(),
        });
      } else {
        setStatus(profileId, agentId, {
          kind: 'fallback',
          reason: 'install_failed',
          since: Date.now(),
          lastError: result.message,
        });
      }
      return result;
    },
    [clientRef, setStatus],
  );

  const uninstallAgent = useCallback(
    async (
      profileId: string,
      agentId: string,
    ): Promise<UninstallResult | { ok: false; reason: 'no_client'; message: string }> => {
      const c = clientRef.current;
      if (!c) {
        return { ok: false, reason: 'no_client', message: 'No active gateway connection' };
      }
      const result = await uninstallAgentsMd(c, agentId);
      if (result.ok) {
        // Mark as fallback so next send injects the primer instead of trying
        // to lazy-install again (the user explicitly opted out).
        setStatus(profileId, agentId, {
          kind: 'fallback',
          reason: 'declined',
          since: Date.now(),
        });
      }
      return result;
    },
    [clientRef, setStatus],
  );

  // ── resolveOnFirstInteraction ────────────────────────────────────────────
  const resolveOnFirstInteraction = useCallback(
    async (profileId: string, agentId: string): Promise<AgentInstallStatus> => {
      const k = makeKey(profileId, agentId);
      const existing = stateRef.current.byAgent[k];
      // Re-install when the convention text has been updated (version bump) so
      // AGENTS.md stays current without requiring manual reinstall per agent.
      const isStaleInstall =
        existing?.kind === 'installed' &&
        existing.conventionVersion < CONVENTION_VERSION;
      if (existing && existing.kind !== 'unknown' && !isStaleInstall) {
        return existing;
      }

      const mode = stateRef.current.globalMode;

      if (mode === 'off' || mode === 'primer') {
        const status: AgentInstallStatus = {
          kind: 'fallback',
          reason: 'global_off',
          since: Date.now(),
        };
        setStatus(profileId, agentId, status);
        return status;
      }

      // mode === 'auto' → kick off install (deduped per agent).
      let inflight = inflightRef.current.get(k);
      if (!inflight) {
        inflight = (async (): Promise<AgentInstallStatus> => {
          const result = await installAgent(profileId, agentId);
          // installAgent already wrote the status — read it back.
          return stateRef.current.byAgent[k] ?? {
            kind: 'fallback',
            reason: 'install_failed',
            since: Date.now(),
            lastError: result.ok ? undefined : result.message,
          };
        })();
        inflightRef.current.set(k, inflight);
        try {
          return await inflight;
        } finally {
          inflightRef.current.delete(k);
        }
      }
      return inflight;
    },
    [installAgent, setStatus],
  );

  // Best-effort: if the active profile changes, clear in-flight installs to
  // avoid mixing them across profiles.
  useEffect(() => {
    inflightRef.current.clear();
  }, [activeProfile?.id]);

  const value = useMemo<ConventionInstallContextValue>(
    () => ({
      hasOnboarded: state.hasOnboarded,
      markOnboarded,
      globalMode: state.globalMode,
      setGlobalMode,
      getStatus,
      setStatus,
      installAgent,
      uninstallAgent,
      resolveOnFirstInteraction,
      isHydrated,
    }),
    [
      state.hasOnboarded,
      state.globalMode,
      markOnboarded,
      setGlobalMode,
      getStatus,
      setStatus,
      installAgent,
      uninstallAgent,
      resolveOnFirstInteraction,
      isHydrated,
    ],
  );

  return (
    <ConventionInstallContext.Provider value={value}>
      {children}
    </ConventionInstallContext.Provider>
  );
}

export function useConventionInstall(): ConventionInstallContextValue {
  const ctx = useContext(ConventionInstallContext);
  if (!ctx) {
    throw new Error('useConventionInstall requires ConventionInstallProvider');
  }
  return ctx;
}
