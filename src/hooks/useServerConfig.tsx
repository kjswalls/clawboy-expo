import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { ServerProfile } from '@/types';

const PROFILES_KEY = 'clawboy-server-profiles-v1';

function authTokenStorageKey(profileId: string): string {
  return `clawboy-auth-token.${profileId}`;
}

function generateId(): string {
  return `prof_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function loadProfilesFromStorage(): Promise<ServerProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: ServerProfile[] = [];
    for (const p of parsed) {
      if (
        typeof p === 'object' &&
        p !== null &&
        typeof (p as ServerProfile).id === 'string' &&
        typeof (p as ServerProfile).name === 'string' &&
        typeof (p as ServerProfile).url === 'string' &&
        typeof (p as ServerProfile).isActive === 'boolean'
      ) {
        out.push(p as ServerProfile);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export interface ServerConfigValue {
  /** False until the first `AsyncStorage` read completes. */
  isHydrated: boolean;
  serverProfiles: ServerProfile[];
  activeProfile: ServerProfile | null;
  /** Persists non-sensitive fields to AsyncStorage and `authToken` to SecureStore. */
  addProfile: (profile: Omit<ServerProfile, 'id'> & { authToken: string }) => Promise<{ id: string; url: string }>;
  removeProfile: (id: string) => Promise<void>;
  setActiveProfile: (id: string) => Promise<void>;
  updateProfile: (id: string, updates: Partial<Omit<ServerProfile, 'id'>> & { authToken?: string }) => Promise<void>;
  getAuthTokenForProfile: (profileId: string) => Promise<string | null>;
}

const ServerConfigContext = createContext<ServerConfigValue | null>(null);

export function ServerConfigProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isHydrated, setIsHydrated] = useState(false);
  const [serverProfiles, setServerProfiles] = useState<ServerProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadProfilesFromStorage();
      if (!cancelled) {
        setServerProfiles(list);
        setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: ServerProfile[]): Promise<void> => {
    setServerProfiles(next);
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(next));
  }, []);

  const getAuthTokenForProfile = useCallback(async (profileId: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(authTokenStorageKey(profileId));
    } catch {
      return null;
    }
  }, []);

  const addProfile = useCallback(
    async (profile: Omit<ServerProfile, 'id'> & { authToken: string }): Promise<{ id: string; url: string }> => {
      const id = generateId();
      const list = await loadProfilesFromStorage();
      const nextList = list.map((p) => ({ ...p, isActive: false }));
      const entry: ServerProfile = {
        id,
        name: profile.name,
        url: profile.url,
        isActive: true,
      };
      await SecureStore.setItemAsync(authTokenStorageKey(id), profile.authToken);
      await persist([...nextList, entry]);
      return { id, url: entry.url };
    },
    [persist]
  );

  const removeProfile = useCallback(
    async (id: string): Promise<void> => {
      const list = await loadProfilesFromStorage();
      const next = list.filter((p) => p.id !== id);
      await SecureStore.deleteItemAsync(authTokenStorageKey(id)).catch(() => {});
      if (next.length > 0 && !next.some((p) => p.isActive)) {
        const first = next[0];
        if (first) {
          next[0] = { ...first, isActive: true };
        }
      }
      await persist(next);
    },
    [persist]
  );

  const setActiveProfile = useCallback(
    async (id: string): Promise<void> => {
      const list = await loadProfilesFromStorage();
      const next = list.map((p) => ({ ...p, isActive: p.id === id }));
      await persist(next);
    },
    [persist]
  );

  const updateProfile = useCallback(
    async (id: string, updates: Partial<Omit<ServerProfile, 'id'>> & { authToken?: string }): Promise<void> => {
      const list = await loadProfilesFromStorage();
      const next = list.map((p) => {
        if (p.id !== id) {
          return p;
        }
        return {
          ...p,
          ...updates,
          id: p.id,
        };
      });
      if (typeof updates.authToken === 'string') {
        await SecureStore.setItemAsync(authTokenStorageKey(id), updates.authToken);
      }
      await persist(next);
    },
    [persist]
  );

  const activeProfile = serverProfiles.find((p) => p.isActive) ?? null;

  const value = useMemo(
    (): ServerConfigValue => ({
      isHydrated,
      serverProfiles,
      activeProfile,
      addProfile,
      removeProfile,
      setActiveProfile,
      updateProfile,
      getAuthTokenForProfile,
    }),
    [
      isHydrated,
      serverProfiles,
      activeProfile,
      addProfile,
      removeProfile,
      setActiveProfile,
      updateProfile,
      getAuthTokenForProfile,
    ]
  );

  return <ServerConfigContext.Provider value={value}>{children}</ServerConfigContext.Provider>;
}

export function useServerConfig(): ServerConfigValue {
  const ctx = useContext(ServerConfigContext);
  if (!ctx) {
    throw new Error('useServerConfig must be used within ServerConfigProvider');
  }
  return ctx;
}
