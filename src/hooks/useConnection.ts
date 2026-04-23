import { useRef, useState, useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { OpenClawClient } from '@/lib/openclaw/client';
import type { WebSocketFactory } from '@/lib/openclaw/types';
import { getOrCreateDeviceIdentity } from '@/lib/device-identity';
import { APP_NAME } from '@/lib/appMeta';
import type { ConnectionState } from '@/types';
import { normalizeGatewayWsUrl } from '@/utils/gatewayUrl';

/** Matches ClawControl store default — no streaming activity after a successful send. */
const RESPONSE_WATCHDOG_MS = 20_000;

export interface ConnectionControllerValue {
  connectionState: ConnectionState;
  /** Increments on each `connect` / `disconnect` / background transition — for stale async guards in other hooks. */
  connectGeneration: number;
  connect: (serverUrl: string, authToken: string) => void;
  disconnect: () => void;
  isConnected: boolean;
  /** WebSocket client instance — always use `.current`; never store the client in React state. */
  client: React.MutableRefObject<OpenClawClient | null>;
}

const wsFactory: WebSocketFactory = (url: string) => new WebSocket(url) as ReturnType<WebSocketFactory>;

function mapConnectError(message: string, deviceId: string | undefined): ConnectionState {
  const lower = message.toLowerCase();
  if (lower.includes('not_paired') || lower.includes('not paired')) {
    return { status: 'pairing_required', deviceId: deviceId ?? 'unknown' };
  }
  if (
    lower.includes('certificate') ||
    lower.includes('tls') ||
    lower.includes('ssl') ||
    lower.includes('handshake')
  ) {
    return { status: 'error', error: 'cert_error', message };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('unreachable')) {
    return { status: 'error', error: 'timeout', message };
  }
  if (lower.includes('connection refused') || lower.includes('closed before handshake') || lower.includes('websocket connection failed')) {
    return { status: 'error', error: 'timeout', message };
  }
  // kCFErrorDomainCFNetwork error 2 = DNS lookup failed (hostname not found)
  if (lower.includes('cfnetwork error 2') || lower.includes('cfnetwork error 1')) {
    return { status: 'error', error: 'timeout', message };
  }
  return { status: 'error', error: 'auth_failed', message };
}

/**
 * WebSocket lifecycle: client ref (non-serializable), `_connectGeneration` guard,
 * exponential backoff inside `OpenClawClient`, response watchdog, tick tracking,
 * AppState pause (background disconnect + foreground resume).
 */
export function useConnectionController(): ConnectionControllerValue {
  const clientRef = useRef<OpenClawClient | null>(null);
  const connectGenerationRef = useRef(0);
  const connectRef = useRef<(serverUrl: string, authToken: string) => void>(() => {});
  const responseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last server `tick` event (ms since epoch) — for health / diagnostics without re-renders. */
  const lastTickAtMsRef = useRef(0);

  const [connectionState, setConnectionState] = useState<ConnectionState>({ status: 'disconnected' });
  const connectionStateRef = useRef(connectionState);
  connectionStateRef.current = connectionState;

  const [connectGeneration, setConnectGeneration] = useState(0);
  const credentialsRef = useRef<{ url: string; token: string } | null>(null);
  const intentionalUserDisconnectRef = useRef(false);
  const resumeAfterBackgroundRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const clearResponseWatchdog = useCallback((): void => {
    if (responseWatchdogRef.current) {
      clearTimeout(responseWatchdogRef.current);
      responseWatchdogRef.current = null;
    }
  }, []);

  const runConnect = useCallback(
    async (serverUrl: string, authToken: string, myGen: number): Promise<void> => {
      const normalizedUrl = normalizeGatewayWsUrl(serverUrl);
      console.log(`[useConnection] runConnect input="${serverUrl}" normalized="${normalizedUrl}" tokenLen=${authToken?.length ?? 0} gen=${myGen}`);
      credentialsRef.current = { url: normalizedUrl, token: authToken };
      intentionalUserDisconnectRef.current = false;

      clearResponseWatchdog();
      setConnectionState({ status: 'connecting' });

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

      const client = new OpenClawClient(normalizedUrl, authToken, 'token', wsFactory, identity, APP_NAME);
      clientRef.current = client;

      const isStale = (): boolean => connectGenerationRef.current !== myGen;

      const onConnected = (): void => {
        if (isStale()) {
          return;
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
        if (prev.status === 'error' || prev.status === 'pairing_required') {
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
        clearResponseWatchdog();
        setConnectionState({
          status: 'error',
          error: 'timeout',
          message: 'Could not reconnect after multiple attempts.',
        });
      };

      const onCertError = (): void => {
        if (isStale()) {
          return;
        }
        clearResponseWatchdog();
        setConnectionState({
          status: 'error',
          error: 'cert_error',
          message: 'TLS certificate validation failed for this server.',
        });
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
            connectRef.current(cred.url, cred.token);
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
      client.on('chatAwaitingResponse', onAwaitingResponse);
      client.on('streamStart', clearWatchdogOnStreamActivity);
      client.on('streamChunk', clearWatchdogOnStreamActivity);
      client.on('thinkingChunk', clearWatchdogOnStreamActivity);
      client.on('streamEnd', clearWatchdogOnStreamActivity);
      client.on('toolCall', clearWatchdogOnStreamActivity);

      try {
        await client.connect();
        if (connectGenerationRef.current !== myGen) {
          return;
        }
        const ver = client.serverVersion ?? 'unknown';
        setConnectionState({ status: 'connected', serverVersion: ver });
      } catch (err) {
        if (connectGenerationRef.current !== myGen) {
          return;
        }
        clearResponseWatchdog();
        const message = err instanceof Error ? err.message : String(err);
        const mapped = mapConnectError(message, identity.id);
        console.warn('[useConnection] connect rejected', { url: normalizedUrl, message, mappedState: mapped });
        client.disconnect();
        if (clientRef.current === client) {
          clientRef.current = null;
        }
        setConnectionState(mapped);
      }
    },
    [clearResponseWatchdog]
  );

  const connect = useCallback(
    (serverUrl: string, authToken: string): void => {
      setConnectGeneration((g) => {
        const next = g + 1;
        connectGenerationRef.current = next;
        void runConnect(serverUrl, authToken, next);
        return next;
      });
    },
    [runConnect]
  );

  connectRef.current = connect;

  const disconnect = useCallback((): void => {
    intentionalUserDisconnectRef.current = true;
    resumeAfterBackgroundRef.current = false;
    clearResponseWatchdog();
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

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      const becameBackground =
        prev === 'active' && (next === 'background' || next === 'inactive');
      const becameActive =
        (prev === 'background' || prev === 'inactive') && next === 'active';

      if (becameBackground) {
        const wasConnected = connectionStateRef.current.status === 'connected';
        if (wasConnected && clientRef.current) {
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
        }
      }

      if (becameActive && resumeAfterBackgroundRef.current && credentialsRef.current) {
        resumeAfterBackgroundRef.current = false;
        const cred = credentialsRef.current;
        setConnectGeneration((g) => {
          const nextGen = g + 1;
          connectGenerationRef.current = nextGen;
          void runConnect(cred.url, cred.token, nextGen);
          return nextGen;
        });
      }
    });
    return () => sub.remove();
  }, [runConnect, clearResponseWatchdog]);

  const isConnected = connectionState.status === 'connected';

  return {
    connectionState,
    connectGeneration,
    connect,
    disconnect,
    isConnected,
    client: clientRef,
  };
}
