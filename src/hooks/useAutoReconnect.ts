import { useCallback, useEffect, useRef } from 'react';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useConnection } from '@/contexts/ConnectionContext';
import type { ServerProfile } from '@/types';

/**
 * Picks the most-recently-connected profile from the list.
 * Falls back to the one flagged `isActive` if no `lastConnectedAt` is set.
 */
function pickBestProfile(profiles: ServerProfile[]): ServerProfile | null {
  if (profiles.length === 0) {
    return null;
  }
  const sorted = [...profiles].sort((a, b) => {
    const aT = a.lastConnectedAt ?? 0;
    const bT = b.lastConnectedAt ?? 0;
    if (bT !== aT) {
      return bT - aT;
    }
    // Tiebreak: prefer the one marked active
    return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
  });
  return sorted[0] ?? null;
}

/**
 * Handles two things automatically so callers don't have to:
 *
 * 1. **Cold-start auto-connect** — as soon as server profiles are hydrated from
 *    AsyncStorage, connect to the most recently used profile. Fires once per
 *    app launch; the background/foreground reconnect cycle is managed separately
 *    by `useConnection`'s AppState listener.
 *
 * 2. **`lastConnectedAt` stamping** — marks the profile timestamp whenever a
 *    connection succeeds, so next launch picks the right server.
 *
 * Call this hook inside a component that is already wrapped by both
 * `ServerConfigProvider` and `ConnectionProvider`.
 */
export function useAutoReconnect(): void {
  const { isHydrated, serverProfiles, getAuthTokenForProfile, markConnected } =
    useServerConfig();
  const { connectionState, connect } = useConnection();

  // Track which profile ID we most recently attempted to connect with so we can
  // stamp `lastConnectedAt` when the connection succeeds.
  const connectingProfileIdRef = useRef<string | null>(null);

  // Guard so the auto-connect fires only once per cold start regardless of how
  // many times the effect dependencies re-evaluate while connecting.
  const hasAutoConnectedRef = useRef(false);

  const doConnect = useCallback(
    async (profile: ServerProfile): Promise<void> => {
      const token = await getAuthTokenForProfile(profile.id);
      if (!token) {
        // No stored token — user will have to connect manually from settings.
        return;
      }
      connectingProfileIdRef.current = profile.id;
      connect(profile.url, token);
    },
    [getAuthTokenForProfile, connect]
  );

  // Effect 1: auto-connect once on cold start.
  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    if (hasAutoConnectedRef.current) {
      return;
    }
    // Don't kick off a second connection if one is already in flight (e.g. user
    // tapped "Connect" on the settings screen before hydration finished).
    if (connectionState.status !== 'disconnected') {
      hasAutoConnectedRef.current = true;
      return;
    }

    const profile = pickBestProfile(serverProfiles);
    if (!profile) {
      return;
    }

    hasAutoConnectedRef.current = true;
    void doConnect(profile);
  }, [isHydrated, connectionState.status, serverProfiles, doConnect]);

  // Effect 2: stamp lastConnectedAt when a connection succeeds.
  useEffect(() => {
    if (connectionState.status !== 'connected') {
      return;
    }
    const id = connectingProfileIdRef.current;
    if (!id) {
      return;
    }
    void markConnected(id);
  }, [connectionState.status, markConnected]);
}
