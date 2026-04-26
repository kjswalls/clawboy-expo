// Mock for useServerConfig — used in component tests to avoid the
// expo-secure-store → native module chain.
module.exports = {
  useServerConfig: () => ({
    isHydrated: true,
    serverProfiles: [],
    activeProfile: null,
    addProfile: async () => ({ id: 'mock', url: '' }),
    removeProfile: async () => {},
    setActiveProfile: async () => {},
    updateProfile: async () => {},
    getAuthTokenForProfile: async () => null,
    markConnected: async () => {},
  }),
  ServerConfigProvider: ({ children }) => children,
};
