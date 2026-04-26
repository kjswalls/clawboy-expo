/**
 * Diagnostics whitelist tests.
 *
 * These guard the security promise: the feedback diagnostics payload must
 * never carry gateway URLs, tokens, device keys, or session IDs — even if
 * a future change accidentally pulls more data in from `appMeta` or
 * `platform`.
 */

jest.mock('@/lib/platform', () => ({
  getPlatformName: jest.fn(() => 'ios'),
  getDeviceInfo: jest.fn(() => ({
    isPhysicalDevice: true,
    modelName: 'iPhone 15 Pro',
    brand: 'Apple',
    manufacturer: 'Apple Inc.',
    osName: 'iOS',
    osVersion: '18.2',
    deviceYearClass: 2023,
  })),
}));

jest.mock('@/lib/appMeta', () => ({
  APP_NAME: 'ClawBoy',
  APP_VERSION: '1.2.3',
  BUILD_NUMBER: '42',
  UPDATE_ID: 'update-abc-123',
  // Things that would be a security violation to include — included here
  // intentionally so the tests can prove they are NOT propagated.
  PROTOCOL_VERSION: '1',
  APP_IDENTIFIER: 'com.clawboy.app',
  OPENCLAW_CLIENT_ID: 'openclaw-control-ui',
}));

import { buildDiagnostics, renderDiagnosticsPreview } from '../diagnostics';

describe('buildDiagnostics()', () => {
  it('returns the whitelisted fields populated from app + platform', () => {
    const d = buildDiagnostics();
    expect(d).toEqual({
      appName: 'ClawBoy',
      appVersion: '1.2.3',
      buildNumber: '42',
      updateId: 'update-abc-123',
      platform: 'ios',
      osName: 'iOS',
      osVersion: '18.2',
      deviceModel: 'iPhone 15 Pro',
      deviceBrand: 'Apple',
      deviceManufacturer: 'Apple Inc.',
      deviceYearClass: 2023,
      locale: expect.any(String),
      timeZone: expect.any(String),
    });
  });

  it('only exposes whitelisted keys (no gateway URL, tokens, device keys, etc.)', () => {
    const d = buildDiagnostics();
    const allowed = new Set([
      'appName',
      'appVersion',
      'buildNumber',
      'updateId',
      'platform',
      'osName',
      'osVersion',
      'deviceModel',
      'deviceBrand',
      'deviceManufacturer',
      'deviceYearClass',
      'locale',
      'timeZone',
    ]);
    for (const key of Object.keys(d)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it('serialises to JSON with no obviously sensitive substrings', () => {
    const json = JSON.stringify(buildDiagnostics()).toLowerCase();
    const forbidden = [
      'token',
      'secret',
      'auth',
      'bearer',
      'wss://',
      'ws://',
      'https://',
      'http://',
      'session',
      'gateway',
      'devicetoken',
      'devicekey',
      'privatekey',
    ];
    for (const term of forbidden) {
      expect(json).not.toContain(term);
    }
  });
});

describe('renderDiagnosticsPreview()', () => {
  it('renders a compact bullet list and skips null fields', () => {
    const preview = renderDiagnosticsPreview({
      appName: 'ClawBoy',
      appVersion: '1.2.3',
      buildNumber: '42',
      updateId: null,
      platform: 'ios',
      osName: 'iOS',
      osVersion: '18.2',
      deviceModel: 'iPhone 15 Pro',
      deviceBrand: null,
      deviceManufacturer: null,
      deviceYearClass: null,
      locale: 'en-US',
      timeZone: 'America/Los_Angeles',
    });
    expect(preview).toContain('• App: ClawBoy 1.2.3 (42)');
    expect(preview).toContain('• Platform: ios');
    expect(preview).toContain('• OS: iOS 18.2');
    expect(preview).toContain('• Device: iPhone 15 Pro');
    expect(preview).toContain('• Locale: en-US');
    expect(preview).toContain('• Time zone: America/Los_Angeles');
    expect(preview).not.toContain('Update ID');
    expect(preview).not.toContain('Brand');
  });
});
