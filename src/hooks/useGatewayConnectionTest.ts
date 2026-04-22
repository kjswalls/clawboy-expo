import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionState } from '@/types';
import { useConnection } from '@/contexts/ConnectionContext';

const TEST_TIMEOUT_MS = 25_000;

export type ConnectionTestResult =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'success'; mode: 'connected' | 'pairing_required' }
  | { kind: 'error'; state: ConnectionState & { status: 'error' } };

/**
 * Drives a one-off gateway connection test: disconnect, connect with ad-hoc
 * credentials, then disconnect again so the test does not keep the client alive.
 */
export function useGatewayConnectionTest(): {
  result: ConnectionTestResult;
  startTest: (url: string, token: string) => void;
  reset: () => void;
} {
  const { connect, disconnect, connectionState } = useConnection();
  const [result, setResult] = useState<ConnectionTestResult>({ kind: 'idle' });
  const testGen = useRef(0);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback((): void => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
      timeoutId.current = null;
    }
  }, []);

  const startTest = useCallback(
    (url: string, token: string): void => {
      clearTimer();
      testGen.current += 1;
      const myTest = testGen.current;
      setResult({ kind: 'testing' });
      disconnect();
      // Let disconnect settle before the next connect.
      setTimeout(() => {
        if (testGen.current !== myTest) {
          return;
        }
        connect(url, token);
        timeoutId.current = setTimeout(() => {
          if (testGen.current !== myTest) {
            return;
          }
          setResult({
            kind: 'error',
            state: { status: 'error', error: 'timeout', message: 'Connection timed out.' },
          });
          disconnect();
        }, TEST_TIMEOUT_MS);
      }, 200);
    },
    [clearTimer, connect, disconnect]
  );

  const reset = useCallback((): void => {
    testGen.current += 1;
    clearTimer();
    setResult({ kind: 'idle' });
  }, [clearTimer]);

  useEffect(() => {
    if (result.kind !== 'testing') {
      return;
    }
    const s = connectionState;
    if (s.status === 'connecting' || s.status === 'disconnected') {
      return;
    }
    if (s.status === 'connected') {
      clearTimer();
      setResult({ kind: 'success', mode: 'connected' });
      disconnect();
      return;
    }
    if (s.status === 'pairing_required') {
      clearTimer();
      setResult({ kind: 'success', mode: 'pairing_required' });
      disconnect();
      return;
    }
    if (s.status === 'error') {
      clearTimer();
      setResult({ kind: 'error', state: s });
      disconnect();
    }
  }, [connectionState, result.kind, clearTimer, disconnect]);

  useEffect(
    () => () => {
      clearTimer();
    },
    [clearTimer]
  );

  return { result, startTest, reset };
}
