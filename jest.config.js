/** @type {import('jest').Config} */
module.exports = {
  projects: [
    // -----------------------------------------------------------------------
    // logic — pure TypeScript logic: protocol layer, device identity, hooks
    //         utilities, chatCache, slash command parsing, etc.
    //         Runs in a plain Node environment with hand-rolled stubs so these
    //         tests are fast and have zero native dependencies.
    // -----------------------------------------------------------------------
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/**/__tests__/**/*.test.ts',
        '<rootDir>/src/**/__tests__/**/*.test.js',
        '<rootDir>/modules/**/__tests__/**/*.test.ts',
      ],
      setupFiles: ['<rootDir>/jest.setup.js'],

      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^expo$': '<rootDir>/src/__mocks__/expo.js',
        '^expo/virtual/(.*)$': '<rootDir>/src/__mocks__/expo-env.js',
        '^expo/(.*)$': '<rootDir>/src/__mocks__/expo-module.js',
        // Specific stubs so tests can override file-system and crypto independently
        // without the two jest.mock() factories colliding on the same resolved path.
        '^expo-file-system(.*)$': '<rootDir>/src/__mocks__/expo-file-system.js',
        '^expo-crypto$': '<rootDir>/src/__mocks__/expo-crypto-mock.js',
        '^expo-network$': '<rootDir>/src/__mocks__/expo-network.js',
        '^expo-(.*)$': '<rootDir>/src/__mocks__/expo-module.js',
        '^@expo/(.*)$': '<rootDir>/src/__mocks__/expo-module.js',
        '^react-native$': '<rootDir>/src/__mocks__/react-native.js',
        '^react-native-(.*)$': '<rootDir>/src/__mocks__/expo-module.js',
        '^@react-native/(.*)$': '<rootDir>/src/__mocks__/expo-module.js',
        '^@react-native-async-storage/async-storage$': '<rootDir>/src/__mocks__/async-storage.js',
      },
      transformIgnorePatterns: [
        // Transform @noble packages (they ship ESM in newer versions).
        'node_modules/(?!(@noble)/)',
      ],
    },
    // -----------------------------------------------------------------------
    // components — React Native component rendering with jest-expo preset.
    //              Only matches .tsx test files to keep them separate from
    //              pure-logic .ts tests in the logic project above.
    // -----------------------------------------------------------------------
    {
      displayName: 'components',
      preset: 'jest-expo/ios',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx'],
      setupFiles: ['<rootDir>/src/__mocks__/component-test-setup.js'],
      moduleNameMapper: {
        // Specific mocks must come BEFORE the generic @/ mapper so they take priority.
        '^@/hooks/useAuthedMedia$': '<rootDir>/src/__mocks__/use-authed-media.js',
        '^@/hooks/useServerConfig$': '<rootDir>/src/__mocks__/use-server-config.js',
        '^@/hooks/useMediaCacheReplay$': '<rootDir>/src/__mocks__/use-media-cache-replay.js',
        '^@/hooks/useAgentFiles$': '<rootDir>/src/__mocks__/use-agent-files.js',
        '^@/hooks/useAgents$': '<rootDir>/src/__mocks__/use-agents.js',
        '^@/contexts/ConnectionContext$': '<rootDir>/src/__mocks__/connection-context.js',
        '^@/contexts/FileViewerContext$': '<rootDir>/src/__mocks__/file-viewer-context.js',
        '^@/(.*)$': '<rootDir>/src/$1',
        '^react-native$': '<rootDir>/src/__mocks__/react-native-full.js',
        '^@react-native-async-storage/async-storage$': '<rootDir>/src/__mocks__/async-storage.js',
        '^react-native-safe-area-context$': '<rootDir>/src/__mocks__/safe-area-context.js',
        '^react-native-reanimated$': '<rootDir>/src/__mocks__/reanimated.js',
        '^react-native-gesture-handler$': '<rootDir>/src/__mocks__/gesture-handler.js',
        '^react-native-gesture-handler/ReanimatedSwipeable$': '<rootDir>/src/__mocks__/reanimated-swipeable.js',
        '^@react-native-masked-view/masked-view$': '<rootDir>/src/__mocks__/masked-view.js',
        '^@ronradtke/react-native-markdown-display$': '<rootDir>/src/__mocks__/markdown-display.js',
        '^lucide-react-native$': '<rootDir>/src/__mocks__/lucide-react-native.js',
        '^react-native-svg$': '<rootDir>/src/__mocks__/react-native-svg.js',
        '^react-syntax-highlighter(.*)$': '<rootDir>/src/__mocks__/syntax-highlighter.js',
        '^react-native-purchases$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-localization$': '<rootDir>/src/__mocks__/expo-localization.js',
        '^expo-secure-store$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-updates$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-application$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-network$': '<rootDir>/src/__mocks__/expo-network.js',
        '^expo-audio$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-image$': '<rootDir>/src/__mocks__/expo-image.js',
        '^expo-linear-gradient$': '<rootDir>/src/__mocks__/expo-linear-gradient.js',
        '^expo-clipboard$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-blur$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-haptics$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-font$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-video$': '<rootDir>/src/__mocks__/expo-video.js',
        '^expo-sharing$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-speech$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-media-library$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-crypto$': '<rootDir>/src/__mocks__/expo-module.js',
        '^expo-file-system(.*)$': '<rootDir>/src/__mocks__/expo-module.js',
      },
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|lucide-react-native|@noble|react-native-purchases)',
      ],
    },
  ],
};
