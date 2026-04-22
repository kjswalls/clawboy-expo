/**
 * WebSocket URL normalization and security hints for the OpenClaw gateway.
 * (Aligned with `useConnection` / gateway expectations.)
 */

export function normalizeGatewayWsUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }
  return `wss://${trimmed}`;
}

export interface GatewayUrlAnalysis {
  normalizedWsUrl: string;
  /** True when the socket URL uses `ws://` (not `wss://`). */
  isInsecureTransport: boolean;
  /** True when the user entered `http://` and it was coerced to `ws://`. */
  wasHttpToWs: boolean;
}

export function analyzeGatewayUrlInput(raw: string): GatewayUrlAnalysis {
  const trimmed = raw.trim();
  let wasHttpToWs = false;
  let working = trimmed;

  if (working.toLowerCase().startsWith('http://') && !working.toLowerCase().startsWith('https://')) {
    wasHttpToWs = true;
    working = `ws://${working.slice('http://'.length)}`;
  }

  const normalizedWsUrl = normalizeGatewayWsUrl(working);
  const isInsecureTransport = normalizedWsUrl.startsWith('ws://');

  return { normalizedWsUrl, isInsecureTransport, wasHttpToWs };
}

export function truncateMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const head = Math.floor((maxLength - 1) / 2);
  const tail = maxLength - 1 - head;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}
