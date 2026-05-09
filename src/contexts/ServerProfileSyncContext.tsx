/**
 * ServerProfileSyncContext — two-way sync between local server profiles and
 * public.server_profile_pointers in Supabase.
 *
 * What syncs:
 *   - URL + label only. Auth tokens, device keys, and chat data NEVER leave
 *     the device. Token: SecureStore only; device keys: non-exportable.
 *
 * Write path (local → cloud):
 *   - Mutations (addProfile / updateProfile / removeProfile) in useServerConfig
 *     call upsertServerPointer / deleteServerPointerByUrl directly after each
 *     local persist. Those call sites are gated on accountStatusRef so they
 *     only fire when the app considers the user signed in.
 *   - refreshRemotePointers() also bulk-upserts all local syncable profiles as
 *     a catch-all seed, handling profiles added before sign-in and recovering
 *     from any previously failed upserts. It reads profiles from a ref that is
 *     updated synchronously during render (not from the useCallback closure),
 *     so it always seeds the current list even when called on a sign-in
 *     transition that races with AsyncStorage hydration.
 *
 * Read path (cloud → UI):
 *   - On sign-in: fetch all cloud pointers and expose those NOT already
 *     present locally as `remotePointers`. The restore UI on onboarding uses
 *     this list to let the user pick a gateway and open AddServerSheet pre-filled.
 *   - Remote pointers are never automatically materialized as local profiles —
 *     the user must complete the token / pairing flow first.
 *   - refreshRemotePointers() can be called manually (e.g. from OnboardingScreen)
 *     to retry after a failed sign-in seed.
 *
 * All Supabase calls swallow errors — sync is best-effort and must never
 * block or break the core "connect to my gateway" flow.
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
import { useAccount } from '@/hooks/useAccount';
import { useServerConfig } from '@/hooks/useServerConfig';
import {
  bulkUpsertServerPointers,
  listServerPointers,
  type ServerPointer,
} from '@/lib/supabase/serverPointers';
import { isDemoProfile } from '@/types';
import type { ServerProfile } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface ServerProfileSyncContextValue {
  /**
   * Cloud pointers that are not already represented in local server profiles
   * (matched by URL). Populated after a successful sign-in fetch. Empty when
   * signed out or when all remote gateways are already configured locally.
   */
  remotePointers: ServerPointer[];
  /** True while a remote pointer fetch is in-flight. */
  isFetchingPointers: boolean;
  /**
   * Seed local profiles up to the cloud then refresh remotePointers.
   * Safe to call any time — no-ops when signed out. Call manually when
   * the user signs in on the onboarding screen to guarantee the fetch
   * runs even if the status-transition effect missed the edge.
   */
  refreshRemotePointers: () => Promise<void>;
}

const ServerProfileSyncContext = createContext<ServerProfileSyncContextValue>({
  remotePointers: [],
  isFetchingPointers: false,
  refreshRemotePointers: async () => {},
});

export function useServerProfileSync(): ServerProfileSyncContextValue {
  return useContext(ServerProfileSyncContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — filter out demo and needsToken placeholder profiles from sync
// ─────────────────────────────────────────────────────────────────────────────

function isSyncable(profile: ServerProfile): boolean {
  return !isDemoProfile(profile) && !profile.needsToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function ServerProfileSyncProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { status } = useAccount();
  const { serverProfiles } = useServerConfig();

  const [remotePointers, setRemotePointers] = useState<ServerPointer[]>([]);
  const [isFetchingPointers, setIsFetchingPointers] = useState(false);

  // Track the previous sign-in status so we only trigger on the transition.
  const prevStatusRef = useRef<string>('unknown');
  // Guard against concurrent seed/fetch operations.
  const seedingRef = useRef(false);

  // Synchronous render-time ref so refreshRemotePointers always reads the
  // current profile list, even when called on the same render that first set
  // status = 'signed-in' (which would otherwise race with AsyncStorage hydration
  // and leave the callback's closure stale at []).
  const serverProfilesRef = useRef(serverProfiles);
  serverProfilesRef.current = serverProfiles;

  // ── Core: seed + fetch ─────────────────────────────────────────────────────

  const refreshRemotePointers = useCallback(async (): Promise<void> => {
    if (status !== 'signed-in') return;
    if (seedingRef.current) return;
    seedingRef.current = true;

    try {
      // Read from the ref so we always seed the latest profile list regardless
      // of when this callback was memoized relative to AsyncStorage hydration.
      const profiles = serverProfilesRef.current;

      // Seed: bulk-upsert all local syncable profiles as a catch-all.
      // Per-mutation sync in useServerConfig already handles new profiles, but
      // this covers profiles added before sign-in and any previously failed upserts.
      const syncable = profiles.filter(isSyncable);
      if (syncable.length > 0) {
        await bulkUpsertServerPointers(
          syncable.map((p) => ({ url: p.url, label: p.name }))
        ).catch(() => {});
      }

      // Fetch all cloud pointers and compute which are remote-only.
      setIsFetchingPointers(true);
      const cloud = await listServerPointers().catch(() => []);
      if (__DEV__) {
        console.log('[ServerSync] refreshRemotePointers', {
          cloudRows: cloud.length,
          localProfiles: profiles.length,
        });
      }
      const localUrls = new Set(profiles.map((p) => p.url));
      setRemotePointers(cloud.filter((ptr) => !localUrls.has(ptr.url)));
    } finally {
      setIsFetchingPointers(false);
      seedingRef.current = false;
    }
  }, [status]);

  // ── Sign-in transition: trigger seed + fetch ───────────────────────────────

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status !== 'signed-in' || prev === 'signed-in') return;

    void refreshRemotePointers();
  }, [status, refreshRemotePointers]);

  // ── Sign-out: clear remote pointers and reset seeding guard ───────────────

  useEffect(() => {
    if (status === 'signed-out') {
      setRemotePointers([]);
      seedingRef.current = false;
    }
  }, [status]);

  const contextValue = useMemo(
    () => ({ remotePointers, isFetchingPointers, refreshRemotePointers }),
    [remotePointers, isFetchingPointers, refreshRemotePointers]
  );

  return (
    <ServerProfileSyncContext.Provider value={contextValue}>
      {children}
    </ServerProfileSyncContext.Provider>
  );
}
