// Minimal React Native stub for node/jest tests.
module.exports = {
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios ?? obj.default,
  },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  NativeModules: {},
  NativeEventEmitter: jest.fn(() => ({
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
};