// Mock for useAgents — used in component tests to avoid the full ConnectionProvider chain.
module.exports = {
  useAgents: () => ({
    agents: [],
    currentAgent: null,
    setCurrentAgent: () => {},
    refreshAgents: async () => {},
    seedAgentFromCache: () => {},
  }),
  AgentsProvider: ({ children }) => children,
};
