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

import { buildConnectionDiagnostics, buildDiagnostics, renderDiagnosticsPreview } from '../diagnostics';
import type { ConnectionState, ProfileSecurity } from '@/types';

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
      // connection is optional but always set as a key (even when undefined)
      'connection',
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

// ── buildConnectionDiagnostics ───────────────────────────────────────────────

function makeSecurity(pinnedSpkiSha256?: string[]): ProfileSecurity {
  return { pinnedSpkiSha256 };
}

describe('buildConnectionDiagnostics()', () => {
  it('disconnected state produces correct snapshot', () => {
    const state: ConnectionState = { status: 'disconnected' };
    const diag = buildConnectionDiagnostics(state, 0, undefined);

    expect(diag.status).toBe('disconnected');
    expect(diag.pinningEnabled).toBe(false);
    expect(diag.pinMismatch).toBe(false);
    expect(diag.reconnectGeneration).toBe(0);
    expect(diag.errorCode).toBeUndefined();
    expect(diag.serverVersion).toBeUndefined();
  });

  it('connected state includes serverVersion when it passes validation', () => {
    const state: ConnectionState = {
      status: 'connected',
      serverVersion: 'v1.2.3',
    };
    const diag = buildConnectionDiagnostics(state, 3, undefined);

    expect(diag.status).toBe('connected');
    expect(diag.serverVersion).toBe('v1.2.3');
  });

  it('filters serverVersion that does not match the safe pattern', () => {
    const state: ConnectionState = {
      status: 'connected',
      // Long string that could exfil data — should be filtered
      serverVersion: 'wss://evil.example.com/exfil?data=secretstuff',
    };
    const diag = buildConnectionDiagnostics(state, 1, undefined);

    expect(diag.serverVersion).toBeUndefined();
  });

  it('filters the literal sentinel string "unknown" so it does not appear in diagnostics', () => {
    const state: ConnectionState = {
      status: 'connected',
      serverVersion: 'unknown',
    };
    const diag = buildConnectionDiagnostics(state, 1, undefined);

    expect(diag.serverVersion).toBeUndefined();
  });

  it('filters serverVersion longer than 40 chars', () => {
    const state: ConnectionState = {
      status: 'connected',
      serverVersion: 'a'.repeat(41),
    };
    const diag = buildConnectionDiagnostics(state, 1, undefined);

    expect(diag.serverVersion).toBeUndefined();
  });

  it('error state includes errorCode and hint', () => {
    const state: ConnectionState = {
      status: 'error',
      error: 'auth_failed',
      message: 'Bad token',
      hint: 'check_tailscale',
    };
    const diag = buildConnectionDiagnostics(state, 5, undefined);

    expect(diag.status).toBe('error');
    expect(diag.errorCode).toBe('auth_failed');
    expect(diag.hint).toBe('check_tailscale');
  });

  it('pinningEnabled is true only when pinnedSpkiSha256 array is non-empty', () => {
    const stateConnected: ConnectionState = { status: 'connected', serverVersion: 'v1' };

    const withPin = buildConnectionDiagnostics(stateConnected, 0, makeSecurity(['abc123']));
    expect(withPin.pinningEnabled).toBe(true);

    const withoutPin = buildConnectionDiagnostics(stateConnected, 0, makeSecurity([]));
    expect(withoutPin.pinningEnabled).toBe(false);

    const noPinField = buildConnectionDiagnostics(stateConnected, 0, makeSecurity(undefined));
    expect(noPinField.pinningEnabled).toBe(false);
  });

  it('pinMismatch is true only when status is pin_mismatch', () => {
    const state: ConnectionState = {
      status: 'pin_mismatch',
      observedSpki: 'whatever',
    };
    const diag = buildConnectionDiagnostics(state, 0, undefined);

    expect(diag.pinMismatch).toBe(true);
    // SPKI hash is NOT included in the diagnostic
    expect(JSON.stringify(diag)).not.toContain('whatever');
  });

  it('does not include gateway URL or auth token even if connection state had them', () => {
    // ConnectionState doesn't carry these, but guard against future regression
    const state: ConnectionState = { status: 'connected', serverVersion: 'v1' };
    const diag = buildConnectionDiagnostics(state, 0, undefined);
    const json = JSON.stringify(diag).toLowerCase();

    const forbidden = ['token', 'secret', 'key', 'wss://', 'https://', 'session'];
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
