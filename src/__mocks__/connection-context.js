// Mock for ConnectionContext — used in component tests to avoid native
// module chains (expo-updates, expo-secure-store, etc.).
module.exports = {
  useConnection: () => ({
    connectionState: { status: 'disconnected' },
    connectGeneration: 0,
    connect: () => {},
    disconnect: () => {},
    isConnected: false,
    client: { current: null },
    gatewayToken: null,
    gatewayUrl: null,
  }),
  ConnectionProvider: ({ children }) => children,
};
