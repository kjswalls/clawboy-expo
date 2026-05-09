// Mock for useAgentFiles — used in component tests.
module.exports = {
  useAgentFiles: () => ({
    files: [],
    loading: false,
    refresh: async () => {},
  }),
};
