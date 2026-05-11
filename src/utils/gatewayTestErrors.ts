import i18n from '@/i18n';
import type { ConnectionState } from '@/types';

export function errorMessageForGatewayTest(state: ConnectionState): string {
  if (state.status !== 'error') {
    return i18n.t('settings.addServer.errors.generic');
  }
  if (state.error === 'cert_error') {
    return i18n.t('settings.addServer.errors.certError');
  }
  if (state.error === 'timeout') {
    return i18n.t('settings.addServer.errors.timeout');
  }
  if (state.error === 'network') {
    if (state.hint === 'check_tailscale') {
      return i18n.t('settings.addServer.errors.tailnetUnreachable');
    }
    const msg = state.message ?? '';
    const lower = msg.toLowerCase();
    if (lower.includes('connection refused')) {
      return i18n.t('settings.addServer.errors.connectionRefused');
    }
    if (lower.includes('cfnetwork error 2') || lower.includes('cfnetwork error 1')) {
      return i18n.t('settings.addServer.errors.hostnameNotFound');
    }
    return i18n.t('settings.addServer.errors.networkGeneric');
  }
  const msg = state.message ?? '';
  const lower = msg.toLowerCase();

  if (
    lower.includes('invalid token') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    (lower.includes('auth') && lower.includes('fail'))
  ) {
    return i18n.t('settings.addServer.errors.authFailed');
  }

  if (lower.includes('device_identity_stale') || lower.includes('signature invalid') || lower.includes('signature mismatch')) {
    return i18n.t('settings.addServer.errors.identityStale');
  }

  // Raw gateway message — leave as-is; power users running their own gateway expect English.
  if (msg) {
    return msg;
  }
  return i18n.t('settings.addServer.errors.fallback');
}
