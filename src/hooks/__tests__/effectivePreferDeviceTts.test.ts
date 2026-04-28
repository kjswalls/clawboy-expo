import { effectivePreferDeviceTts } from '../effectivePreferDeviceTts';

const CONNECTED = { isConnected: true, loading: false, providerCount: 0 };
const LOADING = { isConnected: true, loading: true, providerCount: 0 };
const HAS_PROVIDERS = { isConnected: true, loading: false, providerCount: 2 };
const DISCONNECTED = { isConnected: false, loading: false, providerCount: 0 };

describe('effectivePreferDeviceTts', () => {
  describe('stored preferDeviceTts === true always returns true', () => {
    const cases = [CONNECTED, LOADING, HAS_PROVIDERS, DISCONNECTED];
    test.each(cases)('server state %j', (serverState) => {
      expect(
        effectivePreferDeviceTts({ preferDeviceTts: true, autoSpeakReplies: false, ...serverState }),
      ).toBe(true);
      expect(
        effectivePreferDeviceTts({ preferDeviceTts: true, autoSpeakReplies: true, ...serverState }),
      ).toBe(true);
    });
  });

  describe('override: connected + no providers + autoSpeakReplies', () => {
    it('returns true when all conditions met', () => {
      expect(
        effectivePreferDeviceTts({
          preferDeviceTts: false,
          autoSpeakReplies: true,
          ...CONNECTED,
        }),
      ).toBe(true);
    });

    it('returns false when autoSpeakReplies is off', () => {
      expect(
        effectivePreferDeviceTts({
          preferDeviceTts: false,
          autoSpeakReplies: false,
          ...CONNECTED,
        }),
      ).toBe(false);
    });

    it('returns false while provider list is still loading', () => {
      expect(
        effectivePreferDeviceTts({
          preferDeviceTts: false,
          autoSpeakReplies: true,
          ...LOADING,
        }),
      ).toBe(false);
    });

    it('returns false when gateway has providers configured', () => {
      expect(
        effectivePreferDeviceTts({
          preferDeviceTts: false,
          autoSpeakReplies: true,
          ...HAS_PROVIDERS,
        }),
      ).toBe(false);
    });

    it('returns false when disconnected (provider list may be stale)', () => {
      expect(
        effectivePreferDeviceTts({
          preferDeviceTts: false,
          autoSpeakReplies: true,
          ...DISCONNECTED,
        }),
      ).toBe(false);
    });
  });
});
