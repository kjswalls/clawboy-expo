# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

ClawBoy is an Expo SDK 55 (React Native) iOS chat client for OpenClaw. Package manager is **npm** (`.npmrc` sets `legacy-peer-deps=true`). No linter is configured — TypeScript strict mode (`tsconfig.json`) is the code quality gate.

### Running the app

- **Web mode:** `npx expo start --web --port 8081` — requires `react-dom` and `react-native-web` (install with `npx expo install react-dom react-native-web` if missing). Bundling takes ~18s on first load.
- **Native mode:** requires iOS Simulator or physical device (`npx expo run:ios`). Not available in Cloud Agent VMs.
- The app needs an external OpenClaw gateway (`wss://`) + auth token to function beyond the onboarding screen. Without a real gateway, you can verify the onboarding flow, UI rendering, and error handling.

### Running tests

```bash
npm test                  # pretest (version/changelog sync checks) + Jest (logic + components)
npm run test:logic        # Pure TS logic tests only (fast, no native deps)
npm run test:components   # Component rendering tests (jest-expo/ios preset)
```

**Snapshot timezone caveat:** Some component snapshot tests (`MessageBubble.test.tsx`, `SessionRow.test.tsx`) compare formatted timestamps. They were recorded in a US timezone. In UTC environments (Cloud VMs), these produce harmless snapshot mismatches (e.g., "4:00 AM" vs "12:00 PM"). Update snapshots with `npm test -- -u` only if your code changes don't affect timestamp logic.

### Type checking

```bash
npx tsc --noEmit
```

### Key architecture notes for making changes

- See `README.md` and `.cursorrules` for full architecture details.
- Domain-specific hooks in `src/hooks/`, protocol layer in `src/lib/openclaw/`.
- WebSocket client instance lives in a `useRef`, never in state/context.
- All mocks for tests are in `src/__mocks__/` — two Jest projects (logic + components) use different module resolution. Check `jest.config.js` for the mapper tables.
- The `modules/expo-pinned-websocket/` local module is linked via `file:./modules/expo-pinned-websocket` in `package.json`.
