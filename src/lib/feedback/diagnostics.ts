/**
 * Feedback diagnostics builder.
 *
 * Returns a strictly-whitelisted subset of app + device metadata to attach
 * to a feedback submission. Per `.cursorrules` security rule #1, this MUST
 * NEVER include:
 *   - Gateway URL or hostname
 *   - Auth tokens, device tokens, or session tokens
 *   - Device public/private keys
 *   - Session IDs or message content
 *   - Any contents of `expo-secure-store`
 *
 * Anything here will be surfaced to the user in the in-app preview before
 * they submit, so additions should be obviously safe.
 */
import type { PlatformDeviceInfo, PlatformName } from '@/lib/platform';
import { getDeviceInfo, getPlatformName } from '@/lib/platform';
import { APP_NAME, APP_VERSION, BUILD_NUMBER, UPDATE_ID } from '@/lib/appMeta';

export interface FeedbackDiagnostics {
  appName: string;
  appVersion: string;
  buildNumber: string;
  updateId: string | null;
  platform: PlatformName;
  osName: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  deviceBrand: string | null;
  deviceManufacturer: string | null;
  deviceYearClass: number | null;
  locale: string | null;
  timeZone: string | null;
}

/**
 * Build the diagnostics payload from app + platform metadata.
 * Pure function — safe to call in tests with mocked dependencies.
 */
export function buildDiagnostics(): FeedbackDiagnostics {
  const device = safeGetDeviceInfo();
  const intl = safeGetIntl();

  return {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    buildNumber: BUILD_NUMBER,
    updateId: UPDATE_ID,
    platform: getPlatformName(),
    osName: device.osName,
    osVersion: device.osVersion,
    deviceModel: device.modelName,
    deviceBrand: device.brand,
    deviceManufacturer: device.manufacturer,
    deviceYearClass: device.deviceYearClass,
    locale: intl.locale,
    timeZone: intl.timeZone,
  };
}

/**
 * Render the diagnostics block as compact bullet markdown for the in-app
 * preview. Mirrors what the worker stores in the issue body, so users see
 * exactly what will be submitted.
 */
export function renderDiagnosticsPreview(d: FeedbackDiagnostics): string {
  const rows: Array<[string, string | number | null]> = [
    ['App', `${d.appName} ${d.appVersion} (${d.buildNumber})`],
    ['Update ID', d.updateId],
    ['Platform', d.platform],
    ['OS', joinOs(d.osName, d.osVersion)],
    ['Device', d.deviceModel],
    ['Brand', d.deviceBrand],
    ['Locale', d.locale],
    ['Time zone', d.timeZone],
  ];
  return rows
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `• ${k}: ${String(v)}`)
    .join('\n');
}

function joinOs(name: string | null, version: string | null): string | null {
  const parts = [name, version].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.length > 0 ? parts.join(' ') : null;
}

function safeGetDeviceInfo(): PlatformDeviceInfo {
  try {
    return getDeviceInfo();
  } catch {
    return {
      isPhysicalDevice: false,
      modelName: null,
      brand: null,
      manufacturer: null,
      osName: null,
      osVersion: null,
      deviceYearClass: null,
    };
  }
}

interface IntlInfo {
  locale: string | null;
  timeZone: string | null;
}

function safeGetIntl(): IntlInfo {
  try {
    const opts = new Intl.DateTimeFormat().resolvedOptions();
    return {
      locale: typeof opts.locale === 'string' && opts.locale.length > 0 ? opts.locale : null,
      timeZone: typeof opts.timeZone === 'string' && opts.timeZone.length > 0 ? opts.timeZone : null,
    };
  } catch {
    return { locale: null, timeZone: null };
  }
}
