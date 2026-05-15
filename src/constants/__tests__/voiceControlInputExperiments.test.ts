import { afterEach, describe, expect, it } from '@jest/globals';

const SKIP_KEY = 'EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER';
const HEIGHT_KEY = 'EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT';

function loadFlags() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../voiceControlInputExperiments') as {
    IOS_INPUT_SKIP_PASTE_WRAPPER: boolean;
    IOS_INPUT_USE_INTRINSIC_HEIGHT: boolean;
  };
}

function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

describe('voiceControlInputExperiments flags', () => {
  const originalSkip = process.env[SKIP_KEY];
  const originalHeight = process.env[HEIGHT_KEY];

  afterEach(() => {
    restoreEnv(SKIP_KEY, originalSkip);
    restoreEnv(HEIGHT_KEY, originalHeight);
  });

  describe('IOS_INPUT_SKIP_PASTE_WRAPPER', () => {
    it('is false when env var is unset', () => {
      delete process.env[SKIP_KEY];
      expect(loadFlags().IOS_INPUT_SKIP_PASTE_WRAPPER).toBe(false);
    });

    it('is true when env var is "1"', () => {
      process.env[SKIP_KEY] = '1';
      expect(loadFlags().IOS_INPUT_SKIP_PASTE_WRAPPER).toBe(true);
    });

    it('is false when env var is "0"', () => {
      process.env[SKIP_KEY] = '0';
      expect(loadFlags().IOS_INPUT_SKIP_PASTE_WRAPPER).toBe(false);
    });

    it('is false for any non-"1" value', () => {
      process.env[SKIP_KEY] = 'true';
      expect(loadFlags().IOS_INPUT_SKIP_PASTE_WRAPPER).toBe(false);
    });
  });

  describe('IOS_INPUT_USE_INTRINSIC_HEIGHT', () => {
    it('is false when env var is unset', () => {
      delete process.env[HEIGHT_KEY];
      expect(loadFlags().IOS_INPUT_USE_INTRINSIC_HEIGHT).toBe(false);
    });

    it('is true when env var is "1"', () => {
      process.env[HEIGHT_KEY] = '1';
      expect(loadFlags().IOS_INPUT_USE_INTRINSIC_HEIGHT).toBe(true);
    });

    it('is false when env var is "0"', () => {
      process.env[HEIGHT_KEY] = '0';
      expect(loadFlags().IOS_INPUT_USE_INTRINSIC_HEIGHT).toBe(false);
    });

    it('is false for any non-"1" value', () => {
      process.env[HEIGHT_KEY] = 'true';
      expect(loadFlags().IOS_INPUT_USE_INTRINSIC_HEIGHT).toBe(false);
    });
  });

  describe('flag independence', () => {
    it('skip-paste-wrapper does not affect intrinsic-height', () => {
      process.env[SKIP_KEY] = '1';
      delete process.env[HEIGHT_KEY];
      const flags = loadFlags();
      expect(flags.IOS_INPUT_SKIP_PASTE_WRAPPER).toBe(true);
      expect(flags.IOS_INPUT_USE_INTRINSIC_HEIGHT).toBe(false);
    });

    it('intrinsic-height does not affect skip-paste-wrapper', () => {
      delete process.env[SKIP_KEY];
      process.env[HEIGHT_KEY] = '1';
      const flags = loadFlags();
      expect(flags.IOS_INPUT_SKIP_PASTE_WRAPPER).toBe(false);
      expect(flags.IOS_INPUT_USE_INTRINSIC_HEIGHT).toBe(true);
    });
  });
});
