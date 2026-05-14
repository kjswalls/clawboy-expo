import { afterEach, describe, expect, it } from '@jest/globals';

const KEY = 'EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS';

describe('IOS_INPUT_VOICE_CONTROL_EXPERIMENTS', () => {
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = original;
    }
    jest.resetModules();
  });

  it('is false when the env var is unset', () => {
    delete process.env[KEY];
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IOS_INPUT_VOICE_CONTROL_EXPERIMENTS } = require('../voiceControlInputExperiments');
    expect(IOS_INPUT_VOICE_CONTROL_EXPERIMENTS).toBe(false);
  });

  it('is true when the env var is "1"', () => {
    process.env[KEY] = '1';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IOS_INPUT_VOICE_CONTROL_EXPERIMENTS } = require('../voiceControlInputExperiments');
    expect(IOS_INPUT_VOICE_CONTROL_EXPERIMENTS).toBe(true);
  });
});
