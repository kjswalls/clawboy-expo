export type AuthMethod = 'token' | 'password';

export function parseWsUrl(wsUrl: string): { address: string; port: string } {
  const withoutProto = stripAddressProtocol(wsUrl);
  const portMatch = withoutProto.match(/^(.+):(\d+)(\/.*)?$/);
  if (portMatch) {
    return { address: portMatch[1]!, port: portMatch[2]! };
  }
  return { address: withoutProto, port: '18789' };
}

/** Strip any scheme prefix so users can safely paste a full URL into the address field. */
export function stripAddressProtocol(raw: string): string {
  return raw.trim().replace(/^(wss?|https?):\/\//i, '');
}

export function buildWsUrl(address: string, port: string): string {
  const p = port.trim() || '18789';
  return `wss://${stripAddressProtocol(address)}:${p}`;
}
