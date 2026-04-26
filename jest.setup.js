// Global polyfills / mocks for native APIs that don't exist in node.
global.__DEV__ = true;

// Silence console.warn/log in tests unless needed.
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

// ---- Expo + React Native module stubs ------------------------------------ //
// These stubs cover the minimal surface the OpenClawClient needs when running
// in a node test environment without a native runtime.

jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn().mockResolvedValue(new Uint8Array(32)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn().mockResolvedValue(new Uint8Array(32)),
  getRandomBytes: jest.fn().mockReturnValue(new Uint8Array(32)),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(undefined),
}));

// Prevent React Native from attempting to load native modules.
jest.mock('react-native', () => {
  return {
    Platform: { OS: 'ios', select: (obj) => obj.ios },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    NativeModules: {},
    NativeEventEmitter: jest.fn(() => ({ addListener: jest.fn(), removeAllListeners: jest.fn() })),
  };
});
jest.mock('expo-modules-core', () => ({
  EventEmitter: jest.fn(() => ({ addListener: jest.fn(), removeAllListeners: jest.fn() })),
  requireNativeModule: jest.fn(() => ({})),
  requireOptionalNativeModule: jest.fn(() => null),
}));
