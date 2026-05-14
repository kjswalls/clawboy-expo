import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const KEY = 'EXPO_PUBLIC_IOS_INPUT_VOICE_CONTROL_EXPERIMENTS';

const mockPlatformOS = jest.fn<() => 'ios' | 'android'>(() => 'ios');

jest.mock('react-native', () => ({
  Platform: {
    get OS(): 'ios' | 'android' {
      return mockPlatformOS();
    },
  },
}));

describe('IOS_INPUT_VOICE_CONTROL_EXPERIMENTS', () => {
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = original;
    }
    mockPlatformOS.mockReturnValue('ios');
    jest.resetModules();
  });

  beforeEach(() => {
    mockPlatformOS.mockReturnValue('ios');
  });

  it('defaults to true on iOS when the env var is unset', () => {
    delete process.env[KEY];
    mockPlatformOS.mockReturnValue('ios');
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IOS_INPUT_VOICE_CONTROL_EXPERIMENTS } = require('../voiceControlInputExperiments');
    expect(IOS_INPUT_VOICE_CONTROL_EXPERIMENTS).toBe(true);
  });

  it('defaults to false on Android when the env var is unset', () => {
    delete process.env[KEY];
    mockPlatformOS.mockReturnValue('android');
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IOS_INPUT_VOICE_CONTROL_EXPERIMENTS } = require('../voiceControlInputExperiments');
    expect(IOS_INPUT_VOICE_CONTROL_EXPERIMENTS).toBe(false);
  });

  it('is false on iOS when the env var is "0"', () => {
    process.env[KEY] = '0';
    mockPlatformOS.mockReturnValue('ios');
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IOS_INPUT_VOICE_CONTROL_EXPERIMENTS } = require('../voiceControlInputExperiments');
    expect(IOS_INPUT_VOICE_CONTROL_EXPERIMENTS).toBe(false);
  });

  it('is true on Android when the env var is "1"', () => {
    process.env[KEY] = '1';
    mockPlatformOS.mockReturnValue('android');
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IOS_INPUT_VOICE_CONTROL_EXPERIMENTS } = require('../voiceControlInputExperiments');
    expect(IOS_INPUT_VOICE_CONTROL_EXPERIMENTS).toBe(true);
  });
});
