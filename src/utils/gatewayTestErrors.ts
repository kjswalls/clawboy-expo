import type { ConnectionState } from '@/types';

export function errorMessageForGatewayTest(state: ConnectionState): string {
  if (state.status !== 'error') {
    return 'Connection failed.';
  }
  if (state.error === 'cert_error') {
    return 'Certificate error. Use wss:// or a trusted server.';
  }
  if (state.error === 'timeout') {
    return 'Connection timed out.';
  }
  if (state.message) {
    return state.message;
  }
  return 'Auth failed. Check URL and token.';
}
