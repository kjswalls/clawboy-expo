// Generic stub for any Expo or @expo/* package.
// Tests that need the real implementation must run in a native environment.
module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return {};
      // Return a jest.fn() for anything that looks like a function call.
      return jest.fn().mockResolvedValue(undefined);
    },
  }
);
