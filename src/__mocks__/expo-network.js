// Mock for expo-network in Jest environments.
// addNetworkStateListener returns a subscription object with a remove() method,
// matching the real expo-network API shape.
module.exports = {
  __esModule: true,
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  }),
  NetworkStateType: {
    NONE: 'NONE',
    WIFI: 'WIFI',
    CELLULAR: 'CELLULAR',
    UNKNOWN: 'UNKNOWN',
  },
};
