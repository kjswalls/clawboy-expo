import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { deleteCachedSession } from '@/lib/chatCache';
import { cancelAllDownloads, clearMediaCache } from '@/lib/media/downloadMedia';
import { clearDemoStorage } from '@/lib/demo/demoStorage';
import { useAccount } from '@/hooks/useAccount';
import {
  deleteServerPointerByUrl,
  upsertServerPointer,
} from '@/lib/supabase/serverPointers';
import type { ProfileSecurity, ServerProfile } from '@/types';
import { DEMO_PROFILE_ID } from '@/types';

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
  /** Stamps `lastConnectedAt = Date.now()` on the given profile. Call on successful connect. */
  markConnected: (profileId: string) => Promise<void>;
  /**
   * Merges pinning-related security fields onto the given profile. Used by the
   * TOFU recording flow (Phase D) and by the pin-management UI (Phase E).
   * Non-security profile fields are not affected.
   */
  updateProfileSecurity: (profileId: string, security: Partial<ProfileSecurity>) => Promise<void>;
  /**
   * Activates the offline demo profile. Creates a synthetic ServerProfile with
   * kind='demo' and sets it as active. No network connection or credentials needed.
   */
  enableDemoProfile: () => Promise<void>;
  /**
   * Deactivates and removes the demo profile, clears all demo storage.
   * Call before redirecting to onboarding so the user can add a real server.
   */
  disableDemoProfile: () => Promise<void>;
}

const ServerConfigContext = createContext<ServerConfigValue | null>(null);

export function ServerConfigProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isHydrated, setIsHydrated] = useState(false);
  const [serverProfiles, setServerProfiles] = useState<ServerProfile[]>([]);

  // Always-current in-memory copy — mutations read this instead of re-reading
  // AsyncStorage, which avoids stale-read races when writes are still in-flight.
  const profilesRef = useRef<ServerProfile[]>([]);

  // Synchronous render-time ref so cloud-sync callbacks always read the current
  // auth status without it appearing in their dependency arrays (which would
  // destabilise the context value on every sign-in / sign-out). Writing the
  // ref during render (not in a useEffect) eliminates the one-render lag that
  // would otherwise leave the ref stale immediately after sign-in.
  const { status: accountStatus } = useAccount();
  const accountStatusRef = useRef(accountStatus);
  accountStatusRef.current = accountStatus;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadProfilesFromStorage();
      if (!cancelled) {
        profilesRef.current = list;
        setServerProfiles(list);
        setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: ServerProfile[]): Promise<void> => {
    // Update the ref and React state synchronously so subsequent mutations see
    // the new list immediately, even before the AsyncStorage write completes.
    profilesRef.current = next;
    setServerProfiles(next);
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(next));
  }, []);

  const getAuthTokenForProfile = useCallback(async (profileId: string): Promise<string | null> => {
    // Demo profile never uses a real token.
    if (profileId === DEMO_PROFILE_ID) return 'demo';
    try {
      return await SecureStore.getItemAsync(authTokenStorageKey(profileId));
    } catch {
      return null;
    }
  }, []);

  const addProfile = useCallback(
    async (profile: Omit<ServerProfile, 'id'> & { authToken: string }): Promise<{ id: string; url: string }> => {
      const id = generateId();
      const nextList = profilesRef.current.map((p) => ({ ...p, isActive: false }));
      const entry: ServerProfile = { id, name: profile.name, url: profile.url, isActive: true };
      await SecureStore.setItemAsync(authTokenStorageKey(id), profile.authToken);
      await persist([...nextList, entry]);
      // Cloud sync: upsert pointer so sign-out → sign-in restore works.
      if (entry.id !== DEMO_PROFILE_ID && profile.kind !== 'demo' && !profile.needsToken) {
        if (accountStatusRef.current === 'signed-in') {
          if (__DEV__) console.log('[ServerSync] addProfile → upsert', entry.url);
          void upsertServerPointer({ url: entry.url, label: entry.name }).catch(() => {});
        } else if (__DEV__) {
          console.log('[ServerSync] addProfile → skip upsert (not signed in)', entry.url);
        }
      }
      return { id, url: entry.url };
    },
    [persist]
  );

  const removeProfile = useCallback(
    async (id: string): Promise<void> => {
      // Capture URL before removal for cloud sync below.
      const profileToRemove = profilesRef.current.find((p) => p.id === id);
      await deleteCachedSession(id).catch(() => {});
      await clearMediaCache().catch(() => {});
      const next = profilesRef.current.filter((p) => p.id !== id);
      await SecureStore.deleteItemAsync(authTokenStorageKey(id)).catch(() => {});
      if (next.length > 0 && !next.some((p) => p.isActive)) {
        const first = next[0];
        if (first) next[0] = { ...first, isActive: true };
      }
      await persist(next);
      // Cloud sync: delete the pointer for this URL only when the app considers
      // the user genuinely signed in. getUser() inside the helper is defence-in-depth,
      // but is unreliable when sign-out partially fails — accountStatusRef is the
      // primary guard.
      if (
        profileToRemove &&
        profileToRemove.id !== DEMO_PROFILE_ID &&
        profileToRemove.kind !== 'demo'
      ) {
        if (accountStatusRef.current === 'signed-in') {
          if (__DEV__) console.log('[ServerSync] removeProfile → delete', profileToRemove.url);
          void deleteServerPointerByUrl(profileToRemove.url).catch(() => {});
        } else if (__DEV__) {
          console.log('[ServerSync] removeProfile → skip cloud delete (not signed in)', profileToRemove.url);
        }
      }
    },
    [persist]
  );

  const setActiveProfile = useCallback(
    async (id: string): Promise<void> => {
      // Cancel in-flight downloads and wipe cached media before switching profiles
      // so the incoming profile doesn't accidentally read the previous profile's files.
      cancelAllDownloads();
      await clearMediaCache().catch(() => {});
      const next = profilesRef.current.map((p) => ({ ...p, isActive: p.id === id }));
      await persist(next);
    },
    [persist]
  );

  const updateProfile = useCallback(
    async (id: string, updates: Partial<Omit<ServerProfile, 'id'>> & { authToken?: string }): Promise<void> => {
      const profileBefore = profilesRef.current.find((p) => p.id === id);
      const next = profilesRef.current.map((p) => {
        if (p.id !== id) return p;
        const merged = { ...p, ...updates, id: p.id };
        // Clear needsToken once the user provides a real token.
        if (typeof updates.authToken === 'string' && updates.authToken.length > 0) {
          delete merged.needsToken;
        }
        return merged;
      });
      if (typeof updates.authToken === 'string') {
        await SecureStore.setItemAsync(authTokenStorageKey(id), updates.authToken);
      }
      await persist(next);
      // Cloud sync: keep the pointer in sync when URL or label changes.
      const profileAfter = next.find((p) => p.id === id);
      if (
        profileBefore &&
        profileAfter &&
        profileAfter.id !== DEMO_PROFILE_ID &&
        profileAfter.kind !== 'demo' &&
        !profileAfter.needsToken
      ) {
        if (profileBefore.url !== profileAfter.url) {
          if (accountStatusRef.current === 'signed-in') {
            // URL changed: remove old pointer, create new one.
            if (__DEV__) console.log('[ServerSync] updateProfile → URL change', profileBefore.url, '→', profileAfter.url);
            void deleteServerPointerByUrl(profileBefore.url).catch(() => {});
            void upsertServerPointer({ url: profileAfter.url, label: profileAfter.name }).catch(() => {});
          } else if (__DEV__) {
            console.log('[ServerSync] updateProfile → URL change skipped (not signed in)', profileBefore.url, '→', profileAfter.url);
          }
        } else if (profileBefore.name !== profileAfter.name) {
          if (accountStatusRef.current === 'signed-in') {
            // Label changed: update existing pointer.
            if (__DEV__) console.log('[ServerSync] updateProfile → label change', profileAfter.url);
            void upsertServerPointer({ url: profileAfter.url, label: profileAfter.name }).catch(() => {});
          } else if (__DEV__) {
            console.log('[ServerSync] updateProfile → label change skipped (not signed in)', profileAfter.url);
          }
        }
      }
    },
    [persist]
  );

  const markConnected = useCallback(
    async (id: string): Promise<void> => {
      const next = profilesRef.current.map((p) =>
        p.id === id ? { ...p, lastConnectedAt: Date.now() } : p
      );
      await persist(next);
    },
    [persist]
  );

  const updateProfileSecurity = useCallback(
    async (id: string, security: Partial<ProfileSecurity>): Promise<void> => {
      const next = profilesRef.current.map((p) => {
        if (p.id !== id) return p;
        return { ...p, security: { ...p.security, ...security } };
      });
      await persist(next);
    },
    [persist]
  );

  const enableDemoProfile = useCallback(async (): Promise<void> => {
    // Remove any existing demo profile first to avoid duplicates.
    const withoutDemo = profilesRef.current.filter((p) => p.id !== DEMO_PROFILE_ID);
    const demoProfile: ServerProfile = {
      id: DEMO_PROFILE_ID,
      name: 'Demo',
      url: 'demo://local',
      isActive: true,
      kind: 'demo',
    };
    const next = [...withoutDemo.map((p) => ({ ...p, isActive: false })), demoProfile];
    await persist(next);
  }, [persist]);

  const disableDemoProfile = useCallback(async (): Promise<void> => {
    await clearDemoStorage().catch(() => {});
    const next = profilesRef.current.filter((p) => p.id !== DEMO_PROFILE_ID);
    // If there are other profiles left, activate the most recently connected one.
    if (next.length > 0 && !next.some((p) => p.isActive)) {
      const mostRecent = [...next].sort(
        (a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0),
      );
      if (mostRecent[0]) mostRecent[0] = { ...mostRecent[0], isActive: true };
      await persist(mostRecent);
    } else {
      await persist(next);
    }
  }, [persist]);

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
      markConnected,
      updateProfileSecurity,
      enableDemoProfile,
      disableDemoProfile,
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
      markConnected,
      updateProfileSecurity,
      enableDemoProfile,
      disableDemoProfile,
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
