// Setup file for the components Jest project.
// Suppresses Animated warnings that appear when native drivers are unavailable.
global.__reanimatedWorkletInit = () => {};

// Ensure react-native is NOT mocked (the mock is set by jest.setup.js in the logic project,
// but somehow bleeds into this project). Explicitly unmock to get our moduleNameMapper version.
jest.unmock('react-native');
