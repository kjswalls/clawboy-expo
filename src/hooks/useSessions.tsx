import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSession as createLocalSession } from '@/lib/openclaw/sessions';
import type { Session } from '@/lib/openclaw/types';
import { useConnection } from '@/contexts/ConnectionContext';

const PINNED_SESSIONS_KEY = 'clawboy-pinned-sessions-v1';

export interface SessionsContextValue {
  sessions: Session[];
  currentSessionKey: string | null;
  pinnedKeys: Set<string>;
  setCurrentSession: (key: string) => void;
  createSession: () => Promise<string>;
  resetSession: (key: string) => Promise<void>;
  deleteSession: (key: string) => Promise<void>;
  renameSession: (key: string, title: string) => Promise<void>;
  pinSession: (key: string) => void;
  refreshSessions: () => Promise<void>;
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

  // Mirror current key so `refreshSessions` can read it without re-creating.
  const currentSessionKeyRef = useRef<string | null>(currentSessionKey);
  currentSessionKeyRef.current = currentSessionKey;

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

  useEffect(() => {
    if (connectionState.status !== 'connected') {
      return;
    }
    void refreshSessions();
  }, [connectionState.status, refreshSessions]);

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

  const createSession = useCallback(async (): Promise<string> => {
    const local = await createLocalSession('main');
    setCurrentSessionKey(local.key);
    const oc = openClawRef.current;
    if (oc) {
      oc.setPrimarySessionKey(local.key);
    }
    void refreshSessions();
    return local.key;
  }, [openClawRef, refreshSessions]);

  const resetSession = useCallback(
    async (key: string): Promise<void> => {
      const oc = openClawRef.current;
      if (!oc || connectionState.status !== 'connected') {
        throw new Error('Not connected');
      }
      await oc.call('sessions.reset', { key });
      await refreshSessions();
    },
    [openClawRef, connectionState.status, refreshSessions]
  );

  const deleteSession = useCallback(
    async (key: string): Promise<void> => {
      const oc = openClawRef.current;
      if (!oc || connectionState.status !== 'connected') {
        throw new Error('Not connected');
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
        throw new Error('Not connected');
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
    setCurrentSession,
    createSession,
    resetSession,
    deleteSession,
    renameSession,
    pinSession,
    refreshSessions,
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
