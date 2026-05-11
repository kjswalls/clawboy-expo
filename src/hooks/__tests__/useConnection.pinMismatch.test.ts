/**
 * Unit tests for the pin-mismatch branch of useConnectionController.
 *
 * Strategy:
 *  1. Mock `expo-pinned-websocket` at the module level so that calls to
 *     `createPinnedWebSocket` run our stub that captures the pin callbacks.
 *  2. Mock `Platform.OS` to 'ios' so the pinned factory path is taken.
 *  3. Render `useConnectionController` with `renderHook`.
 *  4. Call `connect()` with a profile that has a pinned hash.
 *  5. Trigger the captured `onPinError` callback and assert the hook enters
 *     `{ status: 'pin_mismatch' }`.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useConnectionController } from '../useConnection';

// ── Module-level mocks ───────────────────────────────────────────────────────

jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/appMeta', () => ({ APP_NAME: 'ClawBoy-Test' }));
jest.mock('@/lib/media/downloadMedia', () => ({ cancelAllDownloads: jest.fn() }));
jest.mock('@/utils/gatewayUrl', () => ({
  normalizeGatewayWsUrl: (url: string) => url,
  parseGatewayWsUrl: (_url: string | null) => ({ host: 'gateway.test', isInsecure: false }),
  isTailnetAddress: (_url: string) => false,
}));
jest.mock('@/lib/device-identity', () => ({
  getOrCreateDeviceIdentity: jest.fn().mockResolvedValue({
    id: 'mock-device-id',
    publicKey: new Uint8Array(32).fill(1),
    privateKey: new Uint8Array(64).fill(2),
  }),
  clearDeviceIdentity: jest.fn().mockResolvedValue(undefined),
  getDeviceToken: jest.fn().mockResolvedValue(null),
  saveDeviceToken: jest.fn().mockResolvedValue(undefined),
  clearDeviceToken: jest.fn().mockResolvedValue(undefined),
}));

// Capture the pin callbacks so tests can trigger them.
let capturedOnPeerSpki: ((hash: string) => void) | undefined;
let capturedOnPinError: ((observed: string, allowed: string[]) => void) | undefined;

jest.mock('expo-pinned-websocket', () => ({
  createPinnedWebSocket: jest.fn((opts: {
    url: string;
    allowedSpkiHashes: string[];
    onPeerSpki?: (hash: string) => void;
    onPinError?: (observed: string, allowed: string[]) => void;
  }) => {
    capturedOnPeerSpki = opts.onPeerSpki;
    capturedOnPinError = opts.onPinError;
    // Return a minimal WebSocketLike that never opens (no TLS handshake).
    return {
      CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
      readyState: 0,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: () => {},
      close: () => {},
    };
  }),
}));

// Force native path.
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return { ...RN, Platform: { ...RN.Platform, OS: 'ios' } };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useConnectionController — pin_mismatch branch', () => {
  const OBSERVED = 'aa'.repeat(32); // 64-char hex
  const ALLOWED  = 'bb'.repeat(32);

  beforeEach(() => {
    capturedOnPeerSpki = undefined;
    capturedOnPinError = undefined;
    jest.clearAllMocks();
  });

  it('transitions to pin_mismatch when onPinError fires', async () => {
    const { result } = renderHook(() => useConnectionController());

    act(() => {
      result.current.connect('wss://gateway.test', 'test-token', {
        pinnedSpkiSha256: [ALLOWED],
      });
    });

    // Flush microtasks for the async connect setup (getOrCreateDeviceIdentity + factory call).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(capturedOnPinError).toBeDefined();

    act(() => {
      capturedOnPinError!(OBSERVED, [ALLOWED]);
    });

    expect(result.current.connectionState).toMatchObject({
      status: 'pin_mismatch',
      observedSpki: OBSERVED,
      allowedSpkis: [ALLOWED],
    });
  });

  it('records observedSpki via onPeerSpki callback without changing connection state', async () => {
    const spkiObserver = jest.fn();

    const { result } = renderHook(() => useConnectionController());

    act(() => {
      result.current.setSpkiObserver(spkiObserver);
      result.current.connect('wss://gateway.test', 'test-token', {
        pinnedSpkiSha256: [],
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(capturedOnPeerSpki).toBeDefined();

    const FIRST_SEEN = 'cc'.repeat(32);
    act(() => {
      capturedOnPeerSpki!(FIRST_SEEN);
    });

    expect(spkiObserver).toHaveBeenCalledWith(FIRST_SEEN);
    // Connection state should NOT have become pin_mismatch.
    expect(result.current.connectionState.status).not.toBe('pin_mismatch');
  });
});
