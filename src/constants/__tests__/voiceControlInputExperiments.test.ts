import { afterEach, describe, expect, it } from '@jest/globals';

const SKIP_KEY = 'EXPO_PUBLIC_IOS_INPUT_SKIP_PASTE_WRAPPER';
const HEIGHT_KEY = 'EXPO_PUBLIC_IOS_INPUT_USE_INTRINSIC_HEIGHT';
const STABLE_KEY = 'EXPO_PUBLIC_IOS_INPUT_STABLE_PROPS';
const LOG_KEY = 'EXPO_PUBLIC_LOG_DICTATION';

function loadFlags() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../voiceControlInputExperiments') as {
    IOS_INPUT_SKIP_PASTE_WRAPPER: boolean;
    IOS_INPUT_USE_INTRINSIC_HEIGHT: boolean;
    IOS_INPUT_STABLE_PROPS: boolean;
    IOS_INPUT_LOG_DICTATION: boolean;
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
  const originalStable = process.env[STABLE_KEY];
  const originalLog = process.env[LOG_KEY];

  afterEach(() => {
    restoreEnv(SKIP_KEY, originalSkip);
    restoreEnv(HEIGHT_KEY, originalHeight);
    restoreEnv(STABLE_KEY, originalStable);
    restoreEnv(LOG_KEY, originalLog);
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

  describe('IOS_INPUT_STABLE_PROPS', () => {
    it('is false when env var is unset', () => {
      delete process.env[STABLE_KEY];
      expect(loadFlags().IOS_INPUT_STABLE_PROPS).toBe(false);
    });

    it('is true when env var is "1"', () => {
      process.env[STABLE_KEY] = '1';
      expect(loadFlags().IOS_INPUT_STABLE_PROPS).toBe(true);
    });

    it('is false when env var is "0"', () => {
      process.env[STABLE_KEY] = '0';
      expect(loadFlags().IOS_INPUT_STABLE_PROPS).toBe(false);
    });

    it('is false for any non-"1" value', () => {
      process.env[STABLE_KEY] = 'true';
      expect(loadFlags().IOS_INPUT_STABLE_PROPS).toBe(false);
    });
  });

  describe('IOS_INPUT_LOG_DICTATION', () => {
    it('is false when env var is unset', () => {
      delete process.env[LOG_KEY];
      expect(loadFlags().IOS_INPUT_LOG_DICTATION).toBe(false);
    });

    it('is true when env var is "1"', () => {
      process.env[LOG_KEY] = '1';
      expect(loadFlags().IOS_INPUT_LOG_DICTATION).toBe(true);
    });

    it('is false when env var is "0"', () => {
      process.env[LOG_KEY] = '0';
      expect(loadFlags().IOS_INPUT_LOG_DICTATION).toBe(false);
    });

    it('is false for any non-"1" value', () => {
      process.env[LOG_KEY] = 'true';
      expect(loadFlags().IOS_INPUT_LOG_DICTATION).toBe(false);
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

    it('stable-props is independent of both others', () => {
      process.env[SKIP_KEY] = '1';
      process.env[HEIGHT_KEY] = '1';
      delete process.env[STABLE_KEY];
      const flags = loadFlags();
      expect(flags.IOS_INPUT_SKIP_PASTE_WRAPPER).toBe(true);
      expect(flags.IOS_INPUT_USE_INTRINSIC_HEIGHT).toBe(true);
      expect(flags.IOS_INPUT_STABLE_PROPS).toBe(false);
    });

    it('log-dictation is independent of all three others', () => {
      process.env[SKIP_KEY] = '1';
      process.env[HEIGHT_KEY] = '1';
      process.env[STABLE_KEY] = '1';
      delete process.env[LOG_KEY];
      const flags = loadFlags();
      expect(flags.IOS_INPUT_SKIP_PASTE_WRAPPER).toBe(true);
      expect(flags.IOS_INPUT_USE_INTRINSIC_HEIGHT).toBe(true);
      expect(flags.IOS_INPUT_STABLE_PROPS).toBe(true);
      expect(flags.IOS_INPUT_LOG_DICTATION).toBe(false);
    });
  });
});
