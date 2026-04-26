// Mock for useAuthedMedia — used in component tests to avoid the
// ConnectionContext → expo-secure-store → native module chain.
module.exports = {
  useAuthedMedia: () => ({
    token: null,
    gatewayUrl: null,
    resolveAuthedSource: () => null,
  }),
};
