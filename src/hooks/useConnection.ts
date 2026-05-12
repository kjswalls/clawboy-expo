import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { addNetworkStateListener } from 'expo-network';
import { debugIngest } from '@/lib/debugIngest';
import { OpenClawClient } from '@/lib/openclaw/client';
import type { WebSocketFactory } from '@/lib/openclaw/types';
import {
  clearDeviceToken,
  getDeviceToken,
  getOrCreateDeviceIdentity,
  saveDeviceToken,
} from '@/lib/device-identity';
import { APP_NAME } from '@/lib/appMeta';
import type { ConnectionState, ProfileSecurity } from '@/types';
import { isTailnetAddress, normalizeGatewayWsUrl, parseGatewayWsUrl } from '@/utils/gatewayUrl';
import { cancelAllDownloads } from '@/lib/media/downloadMedia';
import { createPinnedWebSocket } from 'expo-pinned-websocket';
import { DemoOpenClawClient } from '@/lib/demo';

/** Matches ClawControl store default — no streaming activity after a successful send. */
const RESPONSE_WATCHDOG_MS = 20_000;

/**
 * How long to keep the WebSocket alive after the app enters the background
 * before tearing it down. A brief app switch (notification banner, quick
 * return from another app, Face ID prompt) should not force a full handshake
 * on return. 30 s is long enough to cover nearly all incidental multitasking
 * without keeping a socket alive through actual phone lock / sleep cycles.
 */
const BACKGROUND_DISCONNECT_GRACE_MS = 30_000;

/**
 * While an assistant turn is still streaming we keep extending the background
 * grace window indefinitely — the native WebSocket remains the source of
 * truth. If iOS eventually suspends the JS runtime and/or kills the socket,
 * the native `onclose` path will fire when we resume and the existing
 * disconnect/reconnect logic takes over. There is intentionally no fixed cap
 * here: a stuck server-side turn does not "leak" because (a) the response
 * watchdog cancels stream state if no chunks arrive for RESPONSE_WATCHDOG_MS,
 * and (b) a hung connection is observable via `client.isAlive()` on resume.
 */

export interface ConnectionControllerValue {
  connectionState: ConnectionState;
  /** Increments on each `connect` / `disconnect` / background transition — for stale async guards in other hooks. */
  connectGeneration: number;
  connect: (serverUrl: string, authToken: string, profileSecurity?: ProfileSecurity) => void;
  /**
   * Re-connects using the most recently stored credentials. No-op if no
   * credentials are on record (e.g. before the first `connect` call).
   * Useful after device-identity operations that should be followed by an
   * immediate re-attempt without the caller needing to know the URL/token.
   */
  reconnect: () => void;
  /**
   * Registers a function to be called whenever the native layer observes a
   * gateway certificate SPKI hash. Used by TOFU recording — call this from
   * a component that has access to `useServerConfig` to persist the hash
   * to the active profile.
   *
   * Only one observer is active at a time. Calling this again replaces the
   * previous observer.
   */
  setSpkiObserver: (fn: (hash: string) => void) => void;
  disconnect: () => void;
  isConnected: boolean;
  /** WebSocket client instance — always use `.current`; never store the client in React state. */
  client: React.MutableRefObject<OpenClawClient | null>;
  /**
   * The auth token for the current gateway connection, or null when disconnected.
   * Used to build authenticated media URLs — never persisted or logged.
   */
  gatewayToken: string | null;
  /** The active gateway WebSocket URL (e.g. wss://…). Null when disconnected. */
  gatewayUrl: string | null;
}

/**
 * Guards sticky terminal states from being silently overwritten by background
 * reconnect/error events. `pin_mismatch`, `identity_rejected`, and
 * `pairing_required` require explicit user action to leave — they can only
 * transition to `disconnected` or `connecting` (via a fresh `connect()` call).
 */
function canTransitionTo(from: ConnectionState, to: ConnectionState): boolean {
  if (
    from.status === 'pin_mismatch' ||
    from.status === 'identity_rejected' ||
    from.status === 'pairing_required'
  ) {
    return (
      to.status === 'disconnected' ||
      to.status === 'connecting' ||
      to.status === 'connected'
    );
  }
  return true;
}

function mapConnectError(
  message: string,
  deviceId: string | undefined,
  serverUrl: string,
): ConnectionState {
  const lower = message.toLowerCase();

  if (lower.includes('not_paired') || lower.includes('not paired')) {
    return { status: 'pairing_required', deviceId: deviceId ?? 'unknown' };
  }

  if (/certificate|tls|ssl|handshake/.test(lower)) {
    return { status: 'error', error: 'cert_error', message };
  }

  // Positive evidence of gateway-level auth rejection (server explicitly refused the token).
  // HTTP 4401/4403 synthetic close codes from ExpoPinnedWebsocketModule surface as
  // "HTTP 401" / "HTTP 403" in the reason string.
  if (
    lower.includes('invalid_token') ||
    lower.includes('invalid token') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('http 401') ||
    lower.includes('http 403') ||
    (lower.includes('auth') && lower.includes('fail'))
  ) {
    return { status: 'error', error: 'auth_failed', message };
  }

  if (/timeout|timed out/.test(lower)) {
    return { status: 'error', error: 'timeout', message };
  }

  // Everything else (DNS failure, connection refused, no route, network lost, etc.)
  // is a transport / reachability problem — not an auth problem.
  // Attach a Tailscale hint when the server URL looks like a tailnet address, since
  // "Tailscale not running" is the most likely cause of an otherwise-inexplicable
  // transport failure on a *.ts.net or 100.x.x.x host.
  // Attach a no_internet hint when the error string suggests the device itself is offline.
  if (/network request failed|enotfound|ehostunreach|enetunreach|offline|no internet/i.test(lower)) {
    return { status: 'error', error: 'network', message, hint: 'no_internet' };
  }
  const hint = isTailnetAddress(serverUrl) ? ('check_tailscale' as const) : undefined;
  return { status: 'error', error: 'network', message, ...(hint ? { hint } : {}) };
}

/**
 * WebSocket lifecycle: client ref (non-serializable), `_connectGeneration` guard,
 * exponential backoff inside `OpenClawClient`, response watchdog, tick tracking,
 * AppState pause (background disconnect + foreground resume).
 */
export function useConnectionController(): ConnectionControllerValue {
  const clientRef = useRef<OpenClawClient | null>(null);
  const connectGenerationRef = useRef(0);
  const connectRef = useRef<(serverUrl: string, authToken: string, profileSecurity?: ProfileSecurity) => void>(
    () => {},
  );
  const responseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last server `tick` event (ms since epoch) — for health / diagnostics without re-renders. */
  const lastTickAtMsRef = useRef(0);

  const spkiObserverRef = useRef<((hash: string) => void) | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>({ status: 'disconnected' });
  const connectionStateRef = useRef(connectionState);
  connectionStateRef.current = connectionState;

  const [connectGeneration, setConnectGeneration] = useState(0);
  const credentialsRef = useRef<{ url: string; token: string; security?: ProfileSecurity } | null>(null);
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const intentionalUserDisconnectRef = useRef(false);
  const resumeAfterBackgroundRef = useRef(false);
  /** True when the device went offline while we had (or were building) a connection. */
  const wasOfflineRef = useRef(false);
  const backgroundGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Wall-clock instant when the app most recently entered background. Used
   *  to cap how long we'll extend the grace window while a stream is active. */
  const backgroundEnteredAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const clearResponseWatchdog = useCallback((): void => {
    if (responseWatchdogRef.current) {
      clearTimeout(responseWatchdogRef.current);
      responseWatchdogRef.current = null;
    }
  }, []);

  const runConnect = useCallback(
    async (serverUrl: string, authToken: string, myGen: number, profileSecurity?: ProfileSecurity): Promise<void> => {
      debugIngest(() => ({ runId: 'post-fix-reconnect', hypothesisId: 'H_RECONNECT', location: 'useConnection.ts:runConnect:enter', message: 'runConnect invoked', data: { myGen, curGen: connectGenerationRef.current, prevStatus: connectionStateRef.current.status, appState: appStateRef.current } }));

      // ── Demo profile branch ────────────────────────────────────────────────
      // The demo:// scheme is a reserved sentinel used by the offline demo
      // profile. We skip WebSocket, device identity, and pinning entirely.
      if (serverUrl.startsWith('demo://')) {
        credentialsRef.current = { url: serverUrl, token: authToken, security: profileSecurity };
        setGatewayToken(authToken);
        setGatewayUrl(serverUrl);
        intentionalUserDisconnectRef.current = false;
        clearResponseWatchdog();

        if (connectionStateRef.current.status !== 'pairing_required') {
          setConnectionState({ status: 'connecting' });
        }

        if (clientRef.current) {
          clientRef.current.disconnect();
          clientRef.current = null;
        }

        const demoClient = new DemoOpenClawClient();
        clientRef.current = demoClient as unknown as OpenClawClient;
        await demoClient.connect();

        if (connectGenerationRef.current !== myGen) return;

        setConnectionState({ status: 'connected', serverVersion: 'Demo' });
        return;
      }
      // ── End demo branch ───────────────────────────────────────────────────

      const normalizedUrl = normalizeGatewayWsUrl(serverUrl);
      credentialsRef.current = { url: normalizedUrl, token: authToken, security: profileSecurity };
      const { host: gatewayHost } = parseGatewayWsUrl(normalizedUrl);
      let tokenForConnect = authToken;
      if (gatewayHost) {
        const persistedToken = await getDeviceToken(gatewayHost);
        if (persistedToken) {
          tokenForConnect = persistedToken;
        }
      }
      setGatewayToken(tokenForConnect);
      setGatewayUrl(normalizedUrl);
      intentionalUserDisconnectRef.current = false;

      clearResponseWatchdog();
      // Don't overwrite `pairing_required` with `connecting` during polling
      // retries — the card must stay visible until the gateway confirms approval.
      if (connectionStateRef.current.status !== 'pairing_required') {
        setConnectionState({ status: 'connecting' });
      }

      const identity = await getOrCreateDeviceIdentity();
      if (connectGenerationRef.current !== myGen) {
        return;
      }
      if (!identity) {
        setConnectionState({
          status: 'error',
          error: 'auth_failed',
          message: 'Could not create or load device identity.',
        });
        return;
      }

      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }

      const pinnedHashes = profileSecurity?.pinnedSpkiSha256 ?? [];

      const wsFactory: WebSocketFactory = Platform.OS === 'web'
        ? (url) => new WebSocket(url) as ReturnType<WebSocketFactory>
        : (url) => createPinnedWebSocket({
            url,
            allowedSpkiHashes: pinnedHashes,
            onPeerSpki: (hash) => {
              if (connectGenerationRef.current !== myGen) return;
              onObservedSpki(hash);
            },
            onPinError: (observed, allowed) => {
              if (connectGenerationRef.current !== myGen) return;
              setConnectionState({ status: 'pin_mismatch', observedSpki: observed, allowedSpkis: allowed });
            },
          }) as ReturnType<WebSocketFactory>;

      const client = new OpenClawClient(
        normalizedUrl,
        tokenForConnect,
        'token',
        wsFactory,
        identity,
        APP_NAME
      );
      clientRef.current = client;

      const isStale = (): boolean => connectGenerationRef.current !== myGen;

      const onConnected = (payload?: unknown): void => {
        if (isStale()) {
          return;
        }
        if (gatewayHost) {
          const authPayload =
            payload && typeof payload === 'object'
              ? (payload as { auth?: { deviceToken?: unknown; role?: unknown } }).auth
              : undefined;
          const maybeDeviceToken =
            authPayload && typeof authPayload.deviceToken === 'string'
              ? authPayload.deviceToken
              : null;
          const maybeRole =
            authPayload && typeof authPayload.role === 'string'
              ? authPayload.role
              : undefined;
          if (maybeDeviceToken) {
            void saveDeviceToken(gatewayHost, maybeDeviceToken, maybeRole);
          }
        }
        const ver = client.serverVersion ?? 'unknown';
        setConnectionState({ status: 'connected', serverVersion: ver });
      };

      const onDisconnected = (): void => {
        if (isStale()) {
          return;
        }
        clearResponseWatchdog();
        if (intentionalUserDisconnectRef.current) {
          setConnectionState({ status: 'disconnected' });
          return;
        }
        const prev = connectionStateRef.current;
        if (
          prev.status === 'error' ||
          prev.status === 'pairing_required' ||
          prev.status === 'identity_rejected' ||
          prev.status === 'pin_mismatch'
        ) {
          return;
        }
        if (prev.status === 'connected' || prev.status === 'connecting') {
          setConnectionState({ status: 'connecting' });
          return;
        }
        setConnectionState({ status: 'disconnected' });
      };

      const onReconnectExhausted = (): void => {
        if (isStale()) {
          return;
        }
        const next: ConnectionState = {
          status: 'error',
          error: 'timeout',
          message: 'Could not reconnect after multiple attempts.',
        };
        if (!canTransitionTo(connectionStateRef.current, next)) return;
        clearResponseWatchdog();
        setConnectionState(next);
      };

      const onDeviceIdentityStale = (): void => {
        if (isStale()) {
          return;
        }
        clearResponseWatchdog();
        setConnectionState({
          status: 'identity_rejected',
          deviceId: identity.id,
          reason: 'signature_invalid',
        });
      };

      const onCertError = (): void => {
        if (isStale()) {
          return;
        }
        // A pin-mismatch connection always also produces a TLS error event — let
        // canTransitionTo guard prevent it from overwriting the more specific state.
        const next: ConnectionState = {
          status: 'error',
          error: 'cert_error',
          message: 'TLS certificate validation failed for this server.',
        };
        if (!canTransitionTo(connectionStateRef.current, next)) return;
        clearResponseWatchdog();
        setConnectionState(next);
      };

      // Called when the native layer observes the gateway's SPKI hash.
      const onObservedSpki = (hash: string): void => {
        spkiObserverRef.current?.(hash);
      };

      const onPairing = (payload: unknown): void => {
        if (isStale()) {
          return;
        }
        const p = payload as { deviceId?: string };
        setConnectionState({
          status: 'pairing_required',
          deviceId: p?.deviceId ?? identity.id ?? 'unknown',
        });
      };

      const armResponseWatchdog = (): void => {
        clearResponseWatchdog();
        responseWatchdogRef.current = setTimeout(() => {
          responseWatchdogRef.current = null;
          if (connectGenerationRef.current !== myGen) {
            return;
          }
          if (intentionalUserDisconnectRef.current) {
            return;
          }
          const c = clientRef.current;
          if (c?.isAlive()) {
            return;
          }
          const cred = credentialsRef.current;
          if (cred) {
            connectRef.current(cred.url, cred.token, cred.security);
          }
        }, RESPONSE_WATCHDOG_MS);
      };

      const onAwaitingResponse = (): void => {
        if (isStale()) {
          return;
        }
        armResponseWatchdog();
      };

      const clearWatchdogOnStreamActivity = (): void => {
        if (isStale()) {
          return;
        }
        clearResponseWatchdog();
      };

      client.on('connected', onConnected);
      client.on('disconnected', onDisconnected);
      client.on('tick', () => {
        if (isStale()) {
          return;
        }
        lastTickAtMsRef.current = Date.now();
      });
      client.on('reconnectExhausted', onReconnectExhausted);
      client.on('certError', onCertError);
      client.on('pairingRequired', onPairing);
      client.on('deviceIdentityStale', onDeviceIdentityStale);
      client.on('chatAwaitingResponse', onAwaitingResponse);
      client.on('streamStart', clearWatchdogOnStreamActivity);
      client.on('streamChunk', clearWatchdogOnStreamActivity);
      client.on('thinkingChunk', clearWatchdogOnStreamActivity);
      client.on('streamEnd', clearWatchdogOnStreamActivity);
      client.on('toolCall', clearWatchdogOnStreamActivity);

      try {
        await client.connect();
        if (connectGenerationRef.current !== myGen) {
          debugIngest(() => ({ runId: 'post-fix-reconnect', hypothesisId: 'H_RECONNECT', location: 'useConnection.ts:runConnect:stale', message: 'connect resolved but generation is stale', data: { myGen, curGen: connectGenerationRef.current } }));
          return;
        }
        const ver = client.serverVersion ?? 'unknown';
        debugIngest(() => ({ runId: 'post-fix-reconnect', hypothesisId: 'H_RECONNECT', location: 'useConnection.ts:runConnect:ok', message: 'runConnect succeeded', data: { myGen, serverVersion: ver } }));
        setConnectionState({ status: 'connected', serverVersion: ver });
      } catch (err) {
        if (connectGenerationRef.current !== myGen) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        const mapped = mapConnectError(message, identity.id, normalizedUrl);
        debugIngest(() => ({ runId: 'post-fix-reconnect', hypothesisId: 'H_RECONNECT', location: 'useConnection.ts:runConnect:fail', message: 'runConnect threw', data: { myGen, errMsg: message.slice(0, 300), mappedStatus: mapped.status } }));

        // For recoverable transport errors (network blip, DNS fail, timeout),
        // keep the client alive so OpenClawClient.attemptReconnect can run its
        // built-in exponential-backoff loop (20 attempts, 1–30s). Destroying
        // the client here was racing with attemptReconnect and cancelling it.
        // For sticky auth/cert/pairing errors the client already set
        // suppressReconnect internally — tear it down so no zombie socket lingers.
        const isRecoverable =
          mapped.status === 'error' &&
          (mapped.error === 'network' || mapped.error === 'timeout');

        if (!isRecoverable) {
          client.disconnect();
          if (clientRef.current === client) {
            clientRef.current = null;
          }
        }

        // Don't overwrite a sticky terminal state with a generic error derived from
        // the TLS close frame — those states were set by their event callbacks before
        // the connect() promise rejected and carry the correct message + UI.
        if (!canTransitionTo(connectionStateRef.current, mapped)) return;
        clearResponseWatchdog();
        setConnectionState(mapped);
      }
    },
    [clearResponseWatchdog]
  );

  const connect = useCallback(
    (serverUrl: string, authToken: string, profileSecurity?: ProfileSecurity): void => {
      setConnectGeneration((g) => {
        const next = g + 1;
        connectGenerationRef.current = next;
        void runConnect(serverUrl, authToken, next, profileSecurity);
        return next;
      });
    },
    [runConnect]
  );

  connectRef.current = connect;

  const reconnect = useCallback((): void => {
    const cred = credentialsRef.current;
    if (cred) {
      connect(cred.url, cred.token, cred.security);
    }
  }, [connect]);

  const setSpkiObserver = useCallback((fn: (hash: string) => void): void => {
    spkiObserverRef.current = fn;
  }, []);

  const disconnect = useCallback((): void => {
    intentionalUserDisconnectRef.current = true;
    resumeAfterBackgroundRef.current = false;
    clearResponseWatchdog();
    cancelAllDownloads();
    const { host: gatewayHost } = parseGatewayWsUrl(credentialsRef.current?.url ?? null);
    if (gatewayHost) {
      void clearDeviceToken(gatewayHost);
    }
    setGatewayToken(null);
    setGatewayUrl(null);
    setConnectGeneration((g) => {
      const next = g + 1;
      connectGenerationRef.current = next;
      const c = clientRef.current;
      if (c) {
        c.disconnect();
      }
      clientRef.current = null;
      setConnectionState({ status: 'disconnected' });
      return next;
    });
  }, [clearResponseWatchdog]);

  const teardownForBackground = useCallback((): void => {
    debugIngest(() => ({ hypothesisId: 'H2', location: 'useConnection.ts:teardownForBackground', message: 'teardownForBackground invoked', data: { appState: appStateRef.current, connStatus: connectionStateRef.current.status, hasClient: !!clientRef.current } }));
    resumeAfterBackgroundRef.current = true;
    clearResponseWatchdog();
    setConnectGeneration((g) => {
      const nextGen = g + 1;
      connectGenerationRef.current = nextGen;
      const c = clientRef.current;
      if (c) {
        c.disconnect();
      }
      clientRef.current = null;
      setConnectionState({ status: 'disconnected' });
      return nextGen;
    });
  }, [clearResponseWatchdog]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      const becameBackground =
        prev === 'active' && (next === 'background' || next === 'inactive');
      const becameActive =
        (prev === 'background' || prev === 'inactive') && next === 'active';

      debugIngest(() => ({ hypothesisId: 'H1,H2', location: 'useConnection.ts:AppStateChange', message: 'AppState change', data: { prev, next, becameBackground, becameActive, connStatus: connectionStateRef.current.status, hasClient: !!clientRef.current, isAlive: clientRef.current?.isAlive?.() } }));

      if (becameBackground) {
        const wasConnected = connectionStateRef.current.status === 'connected';
        if (wasConnected && clientRef.current) {
          // Grace window: hold off tearing down immediately. Brief app switches
          // (notification centre, Face ID, app switcher) that return within
          // BACKGROUND_DISCONNECT_GRACE_MS will reuse the existing socket.
          if (backgroundGraceTimerRef.current) {
            clearTimeout(backgroundGraceTimerRef.current);
          }
          if (backgroundEnteredAtRef.current == null) {
            backgroundEnteredAtRef.current = Date.now();
          }
          const scheduleGraceCheck = (): void => {
            backgroundGraceTimerRef.current = setTimeout(() => {
              backgroundGraceTimerRef.current = null;
              if (appStateRef.current === 'active') return;
              const enteredAt = backgroundEnteredAtRef.current ?? Date.now();
              const heldFor = Date.now() - enteredAt;
              const c = clientRef.current;
              const streaming = !!c?.hasAnyActiveStream?.();
              const wsAlive = !!c?.isAlive?.();
              debugIngest(() => ({ runId: 'post-fix-bg2', hypothesisId: 'H2', location: 'useConnection.ts:graceTimerFired', message: 'Background grace timer fired', data: { appState: appStateRef.current, streaming, wsAlive, heldFor, willExtend: streaming && wsAlive, willTearDown: !(streaming && wsAlive) } }));
              // Keep extending while a stream is in flight AND the socket is
              // still alive at the native layer. If iOS killed the socket, the
              // existing onclose handler has already kicked off teardown via
              // its own path; falling through to teardownForBackground here is
              // a clean no-op for an already-disconnected client but ensures
              // we don't sit on a dead client thinking it's connected.
              if (streaming && wsAlive) {
                scheduleGraceCheck();
                return;
              }
              teardownForBackground();
            }, BACKGROUND_DISCONNECT_GRACE_MS);
          };
          scheduleGraceCheck();
        }
      }

      if (becameActive) {
        // Cancel any pending grace tear-down.
        if (backgroundGraceTimerRef.current) {
          clearTimeout(backgroundGraceTimerRef.current);
          backgroundGraceTimerRef.current = null;
        }
        backgroundEnteredAtRef.current = null;

        if (resumeAfterBackgroundRef.current && credentialsRef.current) {
          debugIngest(() => ({ runId: 'post-fix-reconnect', hypothesisId: 'H_RECONNECT', location: 'useConnection.ts:becameActive:resume', message: 'becameActive triggering runConnect (post-teardown)', data: { hasCreds: !!credentialsRef.current } }));
          // We already tore down — reconnect now.
          resumeAfterBackgroundRef.current = false;
          const cred = credentialsRef.current;
          setConnectGeneration((g) => {
            const nextGen = g + 1;
            connectGenerationRef.current = nextGen;
            void runConnect(cred.url, cred.token, nextGen, cred.security);
            return nextGen;
          });
        } else {
          // Still within grace window — check if the socket is still healthy.
          const c = clientRef.current;
          debugIngest(() => ({ runId: 'post-fix-reconnect', hypothesisId: 'H_RECONNECT', location: 'useConnection.ts:becameActive:checkAlive', message: 'becameActive within grace window', data: { hasClient: !!c, wsAlive: !!c?.isAlive?.(), hasCreds: !!credentialsRef.current, resumeFlag: resumeAfterBackgroundRef.current } }));
          if (c && !c.isAlive() && credentialsRef.current) {
            // Socket died silently during the brief background — reconnect.
            const cred = credentialsRef.current;
            setConnectGeneration((g) => {
              const nextGen = g + 1;
              connectGenerationRef.current = nextGen;
              void runConnect(cred.url, cred.token, nextGen, cred.security);
              return nextGen;
            });
          }
          // else: socket is still alive — no action needed.
        }
      }
    });
    return () => {
      sub.remove();
      if (backgroundGraceTimerRef.current) {
        clearTimeout(backgroundGraceTimerRef.current);
        backgroundGraceTimerRef.current = null;
      }
    };
  }, [runConnect, clearResponseWatchdog, teardownForBackground]);

  // Network reachability listener — detects device going offline (e.g. iOS SOS /
  // airplane mode) and coming back online so we can auto-reconnect without requiring
  // the user to re-open the app or tap Settings.
  useEffect(() => {
    const sub = addNetworkStateListener((state) => {
      // Treat null as "unknown / online" to avoid false-positives on the simulator.
      const online =
        state.isConnected !== false && state.isInternetReachable !== false;

      if (!online) {
        // Device went offline — mark it and surface a clear no-internet error.
        wasOfflineRef.current = true;
        const cur = connectionStateRef.current;
        if (
          (cur.status === 'connected' || cur.status === 'connecting') &&
          !intentionalUserDisconnectRef.current
        ) {
          setConnectionState({
            status: 'error',
            error: 'network',
            message: 'No internet connection.',
            hint: 'no_internet',
          });
        }
      } else if (wasOfflineRef.current) {
        // Internet is back — restart a fresh connection cycle if we have creds and
        // the user didn't deliberately disconnect.
        wasOfflineRef.current = false;
        if (credentialsRef.current && !intentionalUserDisconnectRef.current) {
          const cred = credentialsRef.current;
          setConnectGeneration((g) => {
            const nextGen = g + 1;
            connectGenerationRef.current = nextGen;
            void runConnect(cred.url, cred.token, nextGen, cred.security);
            return nextGen;
          });
        }
      }
    });
    return () => { sub.remove(); };
  }, [runConnect]);

  const isConnected = connectionState.status === 'connected';

  return useMemo(() => ({
    connectionState,
    connectGeneration,
    connect,
    reconnect,
    setSpkiObserver,
    disconnect,
    isConnected,
    client: clientRef,
    gatewayToken,
    gatewayUrl,
  }), [
    connectionState,
    connectGeneration,
    connect,
    reconnect,
    setSpkiObserver,
    disconnect,
    isConnected,
    clientRef,
    gatewayToken,
    gatewayUrl,
  ]);
}
