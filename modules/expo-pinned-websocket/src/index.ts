/**
 * expo-pinned-websocket — TOFU SPKI certificate pinning for OpenClaw.
 *
 * Provides a `createPinnedWebSocket()` factory that returns a `WebSocketLike`
 * object (compatible with `src/lib/openclaw/types.ts`). On native platforms
 * it uses a native TLS delegate to extract and optionally pin the gateway's
 * leaf certificate SPKI SHA-256 hash. On web it throws synchronously because
 * browser WebSocket doesn't expose cert data.
 *
 * Usage:
 *   const ws = createPinnedWebSocket({
 *     url: 'wss://my-gateway.ts.net',
 *     allowedSpkiHashes: ['a1b2c3...'],     // empty = TOFU observation only
 *     onPeerSpki: (hash) => { ... },        // called with observed hash
 *     onPinError: (observed, allowed) => { ... },
 *   });
 *   ws.onopen = () => { ws.send('hello'); };
 */

export { createPinnedWebSocket } from './PinnedWebSocket';
export type { PinnedSocketOptions } from './PinnedWebSocket';
