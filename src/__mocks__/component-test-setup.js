// Setup file for the components Jest project.
// Suppresses Animated warnings that appear when native drivers are unavailable.
global.__reanimatedWorkletInit = () => {};

// Ensure react-native is NOT mocked (the mock is set by jest.setup.js in the logic project,
// but somehow bleeds into this project). Explicitly unmock to get our moduleNameMapper version.
jest.unmock('react-native');

// Initialise i18next before any test file runs.
// This must happen in setupFiles (before test-level jest.mock() calls are hoisted)
// so that the real initReactI18next plugin is registered.  Test files that mock
// react-i18next themselves will replace the hook binding, but the i18n singleton
// will already be initialised and won't crash.
// expo-localization is stubbed via moduleNameMapper (jest.config.js) so getLocales()
// returns a usable locale without any native module calls.
require('@/i18n');
