import { useCallback, useEffect, useRef } from 'react';
import { useServerConfig } from '@/hooks/useServerConfig';
import { useConnection } from '@/contexts/ConnectionContext';
import { useBootReady } from '@/contexts/BootReadyContext';
import { pickBestServerProfile } from '@/lib/pickBestServerProfile';
import type { ServerProfile } from '@/types';

/**
 * Safety-net timeout for non-chat routes (e.g. /settings, /onboarding) where
 * ChatScreen never mounts and `diskHydrationAttempted` will never fire.
 */
const SAFETY_TIMEOUT_MS = 500;

/**
 * Handles two things automatically so callers don't have to:
 *
 * 1. **Cold-start auto-connect** — as soon as server profiles are hydrated from
 *    AsyncStorage, connect to the most recently used profile. Waits for the
 *    disk-cache hydration signal (`diskHydrationAttempted`) so the UI can be
 *    seeded from cache before the WebSocket handshake flips state to
 *    `connecting`. Falls back to a 500ms timeout on non-chat routes.
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
  const { diskHydrationAttempted } = useBootReady();

  const connectingProfileIdRef = useRef<string | null>(null);

  const hasAutoConnectedRef = useRef(false);
  const scheduleGenRef = useRef(0);

  const doConnect = useCallback(
    async (profile: ServerProfile): Promise<void> => {
      const token = await getAuthTokenForProfile(profile.id);
      if (!token) {
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
    if (connectionState.status !== 'disconnected') {
      hasAutoConnectedRef.current = true;
      return;
    }

    const profile = pickBestServerProfile(serverProfiles);
    if (!profile) {
      return;
    }

    // If disk hydration has already completed, connect immediately.
    if (diskHydrationAttempted) {
      hasAutoConnectedRef.current = true;
      void doConnect(profile);
      return;
    }

    // Otherwise set up a safety-net timer in case ChatScreen never mounts
    // (non-chat routes) and `diskHydrationAttempted` never fires.
    const myGen = ++scheduleGenRef.current;
    const timer = setTimeout(() => {
      if (scheduleGenRef.current !== myGen || hasAutoConnectedRef.current) {
        return;
      }
      hasAutoConnectedRef.current = true;
      void doConnect(profile);
    }, SAFETY_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [isHydrated, connectionState.status, serverProfiles, doConnect, diskHydrationAttempted]);

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
