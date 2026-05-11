# ClawBoy

A native iOS chat client for OpenClaw, built with Expo (React Native) and TypeScript.

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

## Security

ClawBoy connects to personal OpenClaw gateway instances that may have access to sensitive data (email, files, home automation, etc.). See `.cursorrules` for the full security checklist.

Auth tokens and device keys are stored exclusively in `expo-secure-store`. Never use `AsyncStorage` for sensitive values.
