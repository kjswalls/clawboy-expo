import type { ConnectionState } from '@/types';

export function errorMessageForGatewayTest(state: ConnectionState): string {
  if (state.status !== 'error') {
    return 'Connection failed.';
  }
  if (state.error === 'cert_error') {
    return 'TLS certificate error. The server\'s certificate is not trusted by iOS. Check your gateway\'s cert, or (if on Tailscale) that it\'s using a Tailscale-issued cert.';
  }
  if (state.error === 'timeout') {
    return 'Connection timed out. The server may not be reachable — check the address and port.';
  }
  if (state.error === 'network') {
    if (state.hint === 'check_tailscale') {
      return 'Can\'t reach the server. Make sure **Tailscale is connected** on this device and your server is online.';
    }
    const msg = state.message ?? '';
    const lower = msg.toLowerCase();
    if (lower.includes('connection refused')) {
      return 'Connection refused — the server is reachable but nothing is listening on that port. Check that the OpenClaw gateway is running and bound to a reachable interface (not just `localhost`).';
    }
    if (lower.includes('cfnetwork error 2') || lower.includes('cfnetwork error 1')) {
      return 'Hostname not found — the address couldn\'t be resolved. Check for **typos** in the server address.';
    }
    return 'Can\'t reach the server. Check the address and your network connection.';
  }
  const msg = state.message ?? '';
  const lower = msg.toLowerCase();

  // Gateway explicitly rejected the auth token.
  if (
    lower.includes('invalid token') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    (lower.includes('auth') && lower.includes('fail'))
  ) {
    return 'Authentication failed. The gateway rejected the auth token — make sure it matches the token on the server.';
  }

  // Device identity went stale (keypair changed but server has old key).
  if (lower.includes('device_identity_stale') || lower.includes('signature invalid') || lower.includes('signature mismatch')) {
    return 'This device\'s identity doesn\'t match what the server has on file. Tap the trash icon to forget this device, then reconnect.';
  }

  if (msg) {
    return msg;
  }
  return 'Connection failed. Check the URL and token.';
}
