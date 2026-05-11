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
 * Handles three things automatically so callers don't have to:
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
 * 3. **Safety-net retry** — if the connection lands in a recoverable error
 *    state (network blip, exhausted built-in retries, wsFactory sync throw),
 *    schedules hook-level backoff retries: 5s, 15s, 30s, 60s, 120s (capped).
 *    Covers cases where OpenClawClient's own attemptReconnect can't run (e.g.
 *    wsFactory threw synchronously, so ws.onclose never fired).
 *
 * Call this hook inside a component that is already wrapped by both
 * `ServerConfigProvider` and `ConnectionProvider`.
 */
export function useAutoReconnect(): void {
  const { isHydrated, serverProfiles, getAuthTokenForProfile, markConnected } =
    useServerConfig();
  const { connectionState, connect, gatewayUrl } = useConnection();
  const { diskHydrationAttempted } = useBootReady();

  // Keep a ref so Effect 2 can look up a profile by URL without putting
  // serverProfiles in the dep array (which would re-trigger the stamp effect
  // every time markConnected updates the list).
  const profilesRef = useRef(serverProfiles);
  profilesRef.current = serverProfiles;

  // Track previous connection status so Effect 2 only fires on the rising edge
  // (non-connected → connected). We initialise with the current status so a
  // component that mounts while already connected does not stamp again.
  const prevStatusRef = useRef(connectionState.status);

  const hasAutoConnectedRef = useRef(false);
  const scheduleGenRef = useRef(0);
  const retryAttemptRef = useRef(0);

  const doConnect = useCallback(
    async (profile: ServerProfile): Promise<void> => {
      // Demo profiles don't use SecureStore — short-circuit early.
      const token =
        profile.kind === 'demo' ? 'demo' : await getAuthTokenForProfile(profile.id);
      if (!token) {
        return;
      }
      connect(profile.url, token, profile.security);
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

  // Effect 2: stamp lastConnectedAt on the rising edge of a successful connection.
  // Intentionally excludes serverProfiles from deps — we read it via profilesRef
  // so that markConnected's setServerProfiles update cannot re-trigger this effect.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = connectionState.status;

    // Only act on the non-connected → connected transition.
    if (prev === 'connected' || connectionState.status !== 'connected') {
      return;
    }
    if (!gatewayUrl) {
      return;
    }
    const profile = profilesRef.current.find((p) => p.url === gatewayUrl);
    if (!profile || profile.kind === 'demo') {
      return;
    }
    void markConnected(profile.id);
  }, [connectionState.status, gatewayUrl, markConnected]);

  // Effect 3: safety-net backoff retry for recoverable error states.
  // Covers cases where OpenClawClient.attemptReconnect couldn't run (e.g.
  // wsFactory threw synchronously and ws.onclose never fired) or exhausted
  // its 20 built-in attempts. Backoff: 5s → 15s → 30s → 60s → 120s (capped).
  useEffect(() => {
    if (connectionState.status === 'connected') {
      retryAttemptRef.current = 0;
      return;
    }

    if (connectionState.status !== 'error') {
      return;
    }

    if (connectionState.error !== 'network' && connectionState.error !== 'timeout') {
      return;
    }

    const profile = pickBestServerProfile(profilesRef.current);
    if (!profile) {
      return;
    }

    const attempt = ++retryAttemptRef.current;
    // 5s, 10s, 20s, 40s, 80s… capped at 120s (2 min)
    const delay = Math.min(5_000 * Math.pow(2, attempt - 1), 120_000);

    const t = setTimeout(() => {
      void doConnect(profile);
    }, delay);

    return () => {
      clearTimeout(t);
    };
  }, [connectionState, doConnect]);
}
