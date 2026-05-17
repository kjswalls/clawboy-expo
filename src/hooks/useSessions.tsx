import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClawError } from '@/lib/errors';
import { createSession as createLocalSession, isMainSessionKey } from '@/lib/openclaw/sessions';
import { emitSessionCreated } from '@/badges/events';
import type { Session } from '@/lib/openclaw/types';
import { useConnection } from '@/contexts/ConnectionContext';

const PINNED_SESSIONS_KEY = 'clawboy-pinned-sessions-v1';

const REFRESH_DEBOUNCE_MS = 500;
const REFRESH_MIN_INTERVAL_MS = 1500;

export interface ClearRecentResult {
  deleted: number;
  skipped: number;
  failed: number;
}

export interface SessionsContextValue {
  sessions: Session[];
  currentSessionKey: string | null;
  pinnedKeys: Set<string>;
  /** True after the first successful `sessions.list` RPC completes. */
  hasLoadedOnce: boolean;
  setCurrentSession: (key: string) => void;
  /**
   * Debounced, rate-limited variant of refreshSessions. Safe to call from
   * high-frequency triggers (chat:final, sidebar open). Will no-op if a refresh
   * ran within REFRESH_MIN_INTERVAL_MS or if one is already pending.
   */
  requestRefreshSessions: () => void;
  createSession: (agentId?: string) => Promise<string>;
  resetSession: (key: string) => Promise<void>;
  deleteSession: (key: string) => Promise<void>;
  renameSession: (key: string, title: string) => Promise<void>;
  pinSession: (key: string) => void;
  refreshSessions: () => Promise<void>;
  deleteSessions: (keys: string[]) => Promise<ClearRecentResult>;
  clearRecentSessions: () => Promise<ClearRecentResult>;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

async function loadPinnedKeys(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(PINNED_SESSIONS_KEY);
    if (!raw) {
      return new Set();
    }
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) {
      return new Set();
    }
    return new Set(p.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

async function savePinnedKeys(keys: Set<string>): Promise<void> {
  await AsyncStorage.setItem(PINNED_SESSIONS_KEY, JSON.stringify([...keys]));
}

function useSessionsInternal(): SessionsContextValue {
  const { client: openClawRef, connectionState } = useConnection();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionKey, setCurrentSessionKey] = useState<string | null>(null);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Mirror current key so `refreshSessions` can read it without re-creating.
  const currentSessionKeyRef = useRef<string | null>(currentSessionKey);
  currentSessionKeyRef.current = currentSessionKey;

  const lastRefreshAtRef = useRef<number>(0);
  const pendingRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPinnedKeys().then((s) => {
      if (!cancelled) {
        setPinnedKeys(s);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSessions = useCallback(async (): Promise<void> => {
    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected') {
      return;
    }
    let list: Session[];
    try {
      list = await oc.listSessions();
    } catch (err) {
      // Transient RPC failure (e.g. socket closed mid-call, tick-watchdog
      // force-close during reconnect). Preserve the existing list so the
      // UI doesn't flash empty while the client reconnects.
      console.warn('[useSessions] refreshSessions failed, keeping existing list:', err);
      return;
    }
    setSessions(list);
    setHasLoadedOnce(true);
    lastRefreshAtRef.current = Date.now();

    // Auto-select a session so chat send/receive works without a manual tap.
    // - If server has sessions, pick the most recently updated.
    // - Otherwise create a local "main" session.
    if (!currentSessionKeyRef.current) {
      let key: string;
      if (list.length > 0) {
        const mostRecent = [...list].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0]!;
        key = mostRecent.key;
      } else {
        const local = await createLocalSession('main');
        key = local.key;
      }
      currentSessionKeyRef.current = key;
      setCurrentSessionKey(key);
      oc.setPrimarySessionKey(key);
    }
  }, [openClawRef, connectionState.status]);

  const requestRefreshSessions = useCallback((): void => {
    // No-op if a refresh is already scheduled.
    if (pendingRefreshTimerRef.current !== null) return;
    // No-op if a refresh ran very recently.
    if (Date.now() - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    pendingRefreshTimerRef.current = setTimeout(() => {
      pendingRefreshTimerRef.current = null;
      void refreshSessions();
    }, REFRESH_DEBOUNCE_MS);
  }, [refreshSessions]);

  // Cleanup any pending debounced timer on unmount.
  useEffect(() => {
    return () => {
      if (pendingRefreshTimerRef.current !== null) {
        clearTimeout(pendingRefreshTimerRef.current);
        pendingRefreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (connectionState.status !== 'connected') {
      return;
    }
    void refreshSessions();
  }, [connectionState.status, refreshSessions]);

  // Keep the openclaw client's primary session key in sync with the React
  // currentSessionKey while connected. Without this, cold-start disk hydration
  // sets currentSessionKey before the openclaw client exists, so the client's
  // defaultSessionKey is never set. Subsequent gateway events that arrive
  // without an explicit `sessionKey` (e.g. the post-reset startup greeting)
  // fall back to '__default__' in resolveEventSessionKey and are routed to a
  // phantom cache instead of the user's actual session.
  useEffect(() => {
    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected' || !currentSessionKey) {
      return;
    }
    if (oc.getActiveSessionKey() === currentSessionKey) {
      return;
    }
    oc.setPrimarySessionKey(currentSessionKey);
  }, [openClawRef, connectionState.status, currentSessionKey]);

  useEffect(() => {
    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected') {
      return;
    }

    const onSessionsChanged = (): void => {
      void refreshSessions();
    };

    const onStreamSessionKey = (payload: unknown): void => {
      const p = payload as { sessionKey?: string };
      if (typeof p.sessionKey === 'string' && p.sessionKey) {
        setCurrentSessionKey(p.sessionKey);
        oc.setPrimarySessionKey(p.sessionKey);
      }
    };

    oc.on('sessions.changed', onSessionsChanged);
    oc.on('streamSessionKey', onStreamSessionKey);

    return () => {
      oc.off('sessions.changed', onSessionsChanged);
      oc.off('streamSessionKey', onStreamSessionKey);
    };
  }, [openClawRef, connectionState.status, refreshSessions]);

  const setCurrentSession = useCallback(
    (key: string): void => {
      setCurrentSessionKey(key);
      const oc = openClawRef.current;
      if (oc) {
        oc.setPrimarySessionKey(key);
      }
    },
    [openClawRef]
  );

  const createSession = useCallback(async (agentId?: string): Promise<string> => {
    const local = await createLocalSession(agentId ?? 'main');
    setCurrentSessionKey(local.key);
    const oc = openClawRef.current;
    if (oc) {
      oc.setPrimarySessionKey(local.key);
    }
    emitSessionCreated();
    void refreshSessions();
    return local.key;
  }, [openClawRef, refreshSessions]);

  const resetSession = useCallback(
    async (key: string): Promise<void> => {
      const oc = openClawRef.current;
      if (!oc || connectionState.status !== 'connected') {
        throw new ClawError('not_connected');
      }
      await oc.resetSession(key);
      await refreshSessions();
    },
    [openClawRef, connectionState.status, refreshSessions]
  );

  const deleteSession = useCallback(
    async (key: string): Promise<void> => {
      if (isMainSessionKey(key)) {
        throw new ClawError('main_session_undeletable');
      }
      const oc = openClawRef.current;
      if (!oc || connectionState.status !== 'connected') {
        throw new ClawError('not_connected');
      }
      await oc.deleteSession(key);
      if (currentSessionKey === key) {
        setCurrentSessionKey(null);
        oc.setPrimarySessionKey(null);
      }
      setPinnedKeys((prev) => {
        if (!prev.has(key)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(key);
        void savePinnedKeys(next);
        return next;
      });
      await refreshSessions();
    },
    [openClawRef, connectionState.status, currentSessionKey, refreshSessions]
  );

  const renameSession = useCallback(
    async (key: string, title: string): Promise<void> => {
      const oc = openClawRef.current;
      if (!oc || connectionState.status !== 'connected') {
        throw new ClawError('not_connected');
      }
      await oc.updateSession(key, { label: title });
      await refreshSessions();
    },
    [openClawRef, connectionState.status, refreshSessions]
  );

  const pinSession = useCallback((key: string): void => {
    setPinnedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      void savePinnedKeys(next);
      return next;
    });
  }, []);

  const deleteSessions = useCallback(async (keys: string[]): Promise<ClearRecentResult> => {
    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected') throw new ClawError('not_connected');
    const currentKey = currentSessionKeyRef.current;
    let deleted = 0, skipped = 0, failed = 0;
    for (const key of keys) {
      if (isMainSessionKey(key) || key === currentKey || pinnedKeys.has(key) || oc.hasActiveStream(key)) {
        skipped += 1;
        continue;
      }
      try { await oc.deleteSession(key); deleted += 1; } catch { failed += 1; }
    }
    await refreshSessions();
    return { deleted, skipped, failed };
  }, [openClawRef, connectionState.status, pinnedKeys, refreshSessions]);

  const clearRecentSessions = useCallback(async (): Promise<ClearRecentResult> => {
    const oc = openClawRef.current;
    if (!oc || connectionState.status !== 'connected') {
      throw new ClawError('not_connected');
    }
    // Take a snapshot of pinned state at call time.
    const currentPinned = pinnedKeys;
    const currentKey = currentSessionKeyRef.current;
    // Non-pinned sessions are candidates for deletion.
    const candidates = sessions.filter((s) => !currentPinned.has(s.key));
    let deleted = 0;
    let skipped = 0;
    let failed = 0;
    for (const s of candidates) {
      if (s.key === currentKey || isMainSessionKey(s.key) || oc.hasActiveStream(s.key)) {
        skipped += 1;
        continue;
      }
      try {
        await oc.deleteSession(s.key);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }
    await refreshSessions();
    return { deleted, skipped, failed };
  }, [openClawRef, connectionState.status, pinnedKeys, sessions, refreshSessions]);

  const sortedSessions = useMemo((): Session[] => {
    const pinned: Session[] = [];
    const rest: Session[] = [];
    for (const s of sessions) {
      if (pinnedKeys.has(s.key)) {
        pinned.push(s);
      } else {
        rest.push(s);
      }
    }
    return [...pinned, ...rest];
  }, [sessions, pinnedKeys]);

  return {
    sessions: sortedSessions,
    currentSessionKey,
    pinnedKeys,
    hasLoadedOnce,
    setCurrentSession,
    createSession,
    resetSession,
    deleteSession,
    renameSession,
    pinSession,
    refreshSessions,
    requestRefreshSessions,
    deleteSessions,
    clearRecentSessions,
  };
}

export function SessionsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const value = useSessionsInternal();
  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext);
  if (!ctx) {
    throw new Error('useSessions requires SessionsProvider');
  }
  return ctx;
}
