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
 *   - SPKI hashes (raw certificate fingerprints)
 *
 * Anything here will be surfaced to the user in the in-app preview before
 * they submit, so additions should be obviously safe.
 */
import type { PlatformDeviceInfo, PlatformName } from '@/lib/platform';
import { getDeviceInfo, getPlatformName } from '@/lib/platform';
import { APP_NAME, APP_VERSION, BUILD_NUMBER, UPDATE_ID } from '@/lib/appMeta';
import type { ConnectionState, ProfileSecurity } from '@/types';

// ── Connection diagnostics ──────────────────────────────────────────────────

/**
 * Whitelisted snapshot of the current connection state.
 *
 * Intentionally excludes:
 *  - gateway URL or hostname
 *  - SPKI hashes (even observedSpki from pin_mismatch)
 *  - deviceId (from pairing_required / identity_rejected)
 *  - error message text (may contain hostnames or quoted token fragments)
 *
 * Safe to include:
 *  - status enum (disconnected / connecting / connected / error / ...)
 *  - errorCode enum (standardised — no user content)
 *  - hint enum (check_tailscale / no_internet — reveals Tailscale use, acceptable)
 *  - serverVersion (validated to ≤40 alphanum chars to prevent data exfil)
 *  - reconnectGeneration (counter)
 *  - pinningEnabled (boolean)
 */
export interface ConnectionDiagnostics {
  status: ConnectionState['status'];
  errorCode?: 'auth_failed' | 'cert_error' | 'timeout' | 'network';
  hint?: 'check_tailscale' | 'no_internet';
  /**
   * Validated: only included when it matches /^[\w.\-+ ]{1,40}$/ to prevent
   * gateway-version strings from leaking identifying information.
   */
  serverVersion?: string;
  reconnectGeneration: number;
  pinningEnabled: boolean;
  pinMismatch: boolean;
}

const SERVER_VERSION_PATTERN = /^[\w.\-+ ]{1,40}$/;

/**
 * Build a safe ConnectionDiagnostics snapshot from the current connection
 * state and active server profile security config.
 */
export function buildConnectionDiagnostics(
  connectionState: ConnectionState,
  connectGeneration: number,
  security: ProfileSecurity | undefined,
): ConnectionDiagnostics {
  const status = connectionState.status;
  const pinningEnabled = Boolean(security?.pinnedSpkiSha256?.length);
  const pinMismatch = status === 'pin_mismatch';

  const base: ConnectionDiagnostics = {
    status,
    reconnectGeneration: connectGeneration,
    pinningEnabled,
    pinMismatch,
  };

  if (status === 'error') {
    base.errorCode = connectionState.error;
    if (connectionState.hint) {
      base.hint = connectionState.hint;
    }
  }

  if (status === 'connected') {
    const ver = connectionState.serverVersion;
    if (typeof ver === 'string' && ver !== 'unknown' && SERVER_VERSION_PATTERN.test(ver)) {
      base.serverVersion = ver;
    }
  }

  return base;
}

// ── Main diagnostics ────────────────────────────────────────────────────────

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
  /** Optional connection state snapshot — only included when `connection` arg is provided. */
  connection?: ConnectionDiagnostics;
}

/**
 * Build the diagnostics payload from app + platform metadata.
 * Pass `connection` to include a whitelisted connection state snapshot.
 */
export function buildDiagnostics(opts?: { connection?: ConnectionDiagnostics }): FeedbackDiagnostics {
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
    connection: opts?.connection,
  };
}

// ── Preview renderer ────────────────────────────────────────────────────────

/**
 * Render the diagnostics block as compact bullet markdown for the in-app
 * preview. Mirrors what the worker stores in the issue body, so users see
 * exactly what will be submitted.
 */
export function renderDiagnosticsPreview(d: FeedbackDiagnostics): string {
  const rows: Array<[string, string | number | null | undefined]> = [
    ['App', `${d.appName} ${d.appVersion} (${d.buildNumber})`],
    ['Update ID', d.updateId],
    ['Platform', d.platform],
    ['OS', joinOs(d.osName, d.osVersion)],
    ['Device', d.deviceModel],
    ['Brand', d.deviceBrand],
    ['Locale', d.locale],
    ['Time zone', d.timeZone],
  ];

  if (d.connection) {
    const c = d.connection;
    rows.push(['Connection', c.status]);
    if (c.errorCode) rows.push(['Error', c.errorCode]);
    if (c.hint) rows.push(['Hint', c.hint]);
    if (c.serverVersion) rows.push(['Server version', c.serverVersion]);
    rows.push(['Reconnect gen', c.reconnectGeneration]);
    rows.push(['Pinning', c.pinningEnabled ? 'enabled' : 'disabled']);
    if (c.pinMismatch) rows.push(['Pin mismatch', 'yes']);
  }

  return rows
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `• ${k}: ${String(v)}`)
    .join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
