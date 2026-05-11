import { act, renderHook } from '@testing-library/react-native';
import { useConnectionController } from '../useConnection';

const mockOpenClawCtorArgs: unknown[][] = [];

class mockOpenClawClient {
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  serverVersion: string | null = 'vtest';

  constructor(...args: unknown[]) {
    mockOpenClawCtorArgs.push(args);
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  connect = jest.fn(async () => {
    this.emit('connected', { auth: { deviceToken: 'fresh-token', role: 'operator' } });
  });

  disconnect = jest.fn(() => {
    this.emit('disconnected');
  });

  isAlive = jest.fn(() => false);

  hasAnyActiveStream = jest.fn(() => false);

  private emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((handler) => handler(...args));
  }
}

jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('@/lib/appMeta', () => ({ APP_NAME: 'ClawBoy-Test' }));
jest.mock('@/lib/media/downloadMedia', () => ({ cancelAllDownloads: jest.fn() }));
jest.mock('expo-pinned-websocket', () => ({
  createPinnedWebSocket: jest.fn(() => ({
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    readyState: 1,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send: () => {},
    close: () => {},
  })),
}));
jest.mock('@/utils/gatewayUrl', () => ({
  normalizeGatewayWsUrl: (url: string) => url,
  isTailnetAddress: () => false,
  parseGatewayWsUrl: (url: string | null) => {
    if (!url) return { host: null, isInsecure: false };
    return { host: url.replace(/^wss?:\/\//, '').split('/')[0] ?? null, isInsecure: false };
  },
}));
jest.mock('@/lib/device-identity', () => ({
  getOrCreateDeviceIdentity: jest.fn().mockResolvedValue({
    id: 'mock-device-id',
    publicKey: new Uint8Array(32).fill(1),
    privateKey: new Uint8Array(64).fill(2),
  }),
  getDeviceToken: jest.fn().mockResolvedValue(null),
  saveDeviceToken: jest.fn().mockResolvedValue(undefined),
  clearDeviceToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/openclaw/client', () => ({
  OpenClawClient: jest.fn().mockImplementation((...args: unknown[]) => new mockOpenClawClient(...args)),
}));
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return { ...RN, Platform: { ...RN.Platform, OS: 'ios' } };
});

describe('useConnectionController device token flow', () => {
  beforeEach(() => {
    mockOpenClawCtorArgs.length = 0;
    jest.clearAllMocks();
  });

  it('prefers persisted device token and saves fresh token on connect', async () => {
    const deviceIdentity = jest.requireMock('@/lib/device-identity') as {
      getDeviceToken: jest.Mock;
      saveDeviceToken: jest.Mock;
    };
    deviceIdentity.getDeviceToken.mockResolvedValue('persisted-device-token');

    const { result } = renderHook(() => useConnectionController());

    act(() => {
      result.current.connect('wss://gateway.test', 'user-token');
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockOpenClawCtorArgs.length).toBeGreaterThan(0);
    expect(mockOpenClawCtorArgs[0]?.[1]).toBe('persisted-device-token');
    expect(deviceIdentity.saveDeviceToken).toHaveBeenCalledWith(
      'gateway.test',
      'fresh-token',
      'operator'
    );
  });

  it('clears persisted token on manual disconnect', async () => {
    const deviceIdentity = jest.requireMock('@/lib/device-identity') as {
      clearDeviceToken: jest.Mock;
    };
    const { result } = renderHook(() => useConnectionController());

    act(() => {
      result.current.connect('wss://gateway.test', 'user-token');
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(deviceIdentity.clearDeviceToken).toHaveBeenCalledWith('gateway.test');
  });
});
