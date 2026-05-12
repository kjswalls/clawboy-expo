# ClawBoy

ClawBoy is a native iOS chat client for [OpenClaw](https://github.com/openclaw/openclaw), built with Expo (React Native) and TypeScript. It connects to your personal OpenClaw gateway over a WebSocket connection and provides a power-user chat interface for interacting with AI agents — streaming responses, thinking blocks, tool call cards, session management, and multi-gateway support.

ClawBoy is designed for people who run their own OpenClaw instance and want a premium mobile experience that matches the capabilities of the web UI.

## Connecting to a Gateway

To use ClawBoy, you need a running [OpenClaw gateway](https://github.com/openclaw/openclaw). On first launch, you will be prompted to enter:

- **Gateway URL** — a `wss://` WebSocket URL pointing to your OpenClaw instance (e.g. `wss://my-gateway.example.com`)
- **Auth token** — the gateway token from your OpenClaw configuration

> **Note:** ClawBoy defaults to `wss://` and will warn you if you enter an unencrypted `ws://` URL. Never connect over unencrypted WebSocket from a production device.

On first connect, ClawBoy performs an **Ed25519 device pairing** handshake: the gateway issues a nonce challenge, the app signs it with a locally-generated device keypair stored in secure storage, and the gateway responds with a device token for future reconnects. You will see a pairing approval prompt in your gateway's device management interface.

Multiple server profiles are supported — you can add and switch between gateways from the Settings screen.

## Security

ClawBoy connects to personal OpenClaw gateways that may have access to sensitive data (email, files, home automation, etc.). Auth tokens and device keys are stored exclusively in `expo-secure-store`. See [SECURITY.md](SECURITY.md) for the full security policy and responsible disclosure process.

## Getting Started

```bash
npm install
npx expo start
```

For a native development build:

```bash
npx expo prebuild
npx expo run:ios
```

## EAS Build & Submit Setup

The `eas.json` file contains Apple App Store Connect identifiers that are specific to the original maintainer's account. **Contributors and forks must substitute their own values** before running `eas submit`.

### Apple identifiers to replace

| Field | Location in `eas.json` | What it is |
|---|---|---|
| `appleTeamId` | `submit.production.ios.appleTeamId` | Your 10-character Apple Developer Team ID (found at [developer.apple.com/account](https://developer.apple.com/account) → Membership) |
| `ascAppId` | `submit.production.ios.ascAppId` | The numeric App ID from App Store Connect → App Information → Apple ID |
| `ascApiKeyId` | `submit.production.ios.ascApiKeyId` | The key ID portion of your App Store Connect API key (the part after `AuthKey_`) |
| `ascApiKeyIssuerId` | `submit.production.ios.ascApiKeyIssuerId` | The Issuer ID from App Store Connect → Users and Access → Integrations → App Store Connect API |
| `$EAS_ASC_API_KEY_PATH` | `submit.production.ios.ascApiKeyPath` | Set the `EAS_ASC_API_KEY_PATH` environment variable to the absolute path of your `.p8` API key file on your local machine, **or** use `eas secret:create` to store it in EAS Secrets |

None of these values are cryptographic secrets (the `.p8` file itself is the secret, and it lives outside the repo). They are included for convenience but must be swapped for your own account before submitting.

### Setting the API key path

```bash
# Option A — environment variable (recommended for CI)
export EAS_ASC_API_KEY_PATH="/path/to/AuthKey_XXXXXXXX.p8"
eas submit --platform ios --profile production

# Option B — EAS Secrets (recommended for teams)
eas secret:create --scope project --name ASC_API_KEY_BASE64 --value "$(base64 -i AuthKey_XXXXXXXX.p8)"
# then update eas.json to use ascApiKey block instead of ascApiKeyPath
```

## Environment

- **Expo SDK:** 55
- **iOS deployment target:** 15.1
- **Push notifications:** not enabled in MVP (Phase 2 roadmap)
- **Face ID / biometric auth:** not used by the app; `expo-secure-store` is configured with `faceIDPermission: false`

## Architecture (for contributors)

The app lives entirely under `src/`. Key areas:

```
src/
├── lib/openclaw/     # WebSocket protocol layer (client, types, chat, sessions, agents, …)
├── lib/              # device-identity.ts (Ed25519 pairing), platform.ts (Expo abstractions)
├── hooks/            # Domain-specific hooks: useConnection, useChat, useSessions, useAgents, …
├── components/       # chat/, input/, sidebar/, settings/, common/ — all <300 lines each
├── contexts/         # ConnectionContext, ThemeContext
└── app/              # Expo Router screens (_layout, index, settings, onboarding)
```

- `useConnection` owns the WebSocket lifecycle; `useChat` owns streaming and message cache — they do not know about each other's internals.
- The WebSocket `client` instance lives in a `useRef`, never in React state or context value.
- All sensitive data (tokens, device keys) goes in `expo-secure-store` exclusively — never `AsyncStorage`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style and PR process.

## Developer Security Notes

Auth tokens and device keys are stored exclusively in `expo-secure-store`. Never use `AsyncStorage` for sensitive values. See [SECURITY.md](SECURITY.md) for the responsible disclosure policy.
