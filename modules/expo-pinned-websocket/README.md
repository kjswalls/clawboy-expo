# expo-pinned-websocket

A native Expo module that provides a SPKI-pinned WebSocket for iOS and Android, implementing the `WebSocketLike` interface expected by the OpenClaw protocol layer.

## Why this module exists

React Native's built-in `WebSocket` (SocketRocket on iOS, OkHttp on Android) exposes no per-socket TLS hook, making SPKI pinning impossible without a native module.

We evaluated the available third-party alternatives and rejected them all:

| Library | Problem |
|---------|---------|
| [`react-native-ssl-websocket`](https://github.com/dangttp97/react-native-ssl-websocket) | 1 star / 0 forks, single author, no CI — not suitable for a security-critical path |
| [`react-native-pinned-ws`](https://github.com/Gerem66/react-native-pinned-ws) | 0 stars / 0 forks, README explicitly states it was AI-generated |
| [`react-native-ssl-public-key-pinning`](https://github.com/frw/react-native-ssl-public-key-pinning) | HTTP/fetch only — no WebSocket support |
| [`react-native-ssl-pinning`](https://github.com/MaxToyberman/react-native-ssl-pinning) | Unanswered open issue requesting WebSocket support |

ClawBoy connects to gateways that can access email, banking, files, and shell access. Trusting an unaudited single-author dependency for the TLS layer is not acceptable.

## What it does

- **TOFU (Trust On First Use):** On the first connection to a gateway, the leaf certificate's SPKI SHA-256 hash is observed and surfaced to JS via `onPeerSpki`. The UI can then prompt the user to save it as a pin.
- **Active pinning:** On subsequent connections, if `allowedSpkiHashes` is non-empty, the observed hash must match one of the saved pins. A mismatch triggers `onPinError` and cancels the handshake.
- **Standard TLS validation first:** OS trust evaluation runs before any SPKI check. A certificate that fails standard chain validation is rejected even in TOFU mode.
- **Key-type agnostic:** The iOS implementation extracts SPKI directly from the certificate DER via ASN.1 parsing (`SecCertificateCopyData`) rather than a key-type header table, producing the same hash as Chrome, Firefox, and Android for all key types: RSA (any size), EC (any curve), Ed25519.

## Architecture

```
JS: createPinnedWebSocket(opts)         (PinnedWebSocket.ts)
    └─ Native bridge: createSocket / sendMessage / closeSocket
           ├─ iOS:     URLSessionWebSocketTask + custom URLSession delegate
           │           that intercepts didReceive challenge for SPKI extraction
           └─ Android: OkHttp WebSocket + custom X509TrustManager
                       that wraps the OS default TrustManager
```

## Usage

```typescript
import { createPinnedWebSocket } from 'expo-pinned-websocket';

const ws = createPinnedWebSocket({
  url: 'wss://my-gateway.ts.net',
  allowedSpkiHashes: [],            // empty = TOFU observation mode
  onPeerSpki: (sha256Hex) => {      // called with observed hash
    // prompt user to save as pin
  },
  onPinError: (observed, allowed) => {
    // surface mismatch UI
  },
});

ws.onopen = () => ws.send('hello');
ws.onmessage = (e) => console.log(e.data);
```

## Platform notes

- **Web:** throws synchronously — browser WebSocket doesn't expose cert data.
- **iOS:** requires iOS 15.1+ (URLSessionWebSocketTask with TLS delegate).
- **Android:** requires API 21+ (OkHttp 4 / modern TLS stack).
