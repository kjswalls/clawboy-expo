# Changelog

All notable changes to ClawBoy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

_No unreleased changes yet._

---

## [1.0.0] - 2026-04-28

First release of ClawBoy. Everything below ships together as version 1 — no earlier public release exists. Additional items after the initial changelog draft are still pre-release work toward the same 1.0.0 ship; there is no separate version bump yet.

### Added

- Native iOS/Android chat client for **OpenClaw** over WebSocket (`wss://`), with JSON-RPC request/response/events, keepalive/ticks, and defensive parsing of gateway payloads.
- **Device pairing** via Ed25519 identity keys stored only in Secure Store; challenge-response handshake before connecting.
- **Reconnection** with exponential backoff, jitter, capped attempts, and reconnect when the app returns to the foreground.
- **Session stream isolation** so switching sessions during streaming does not corrupt the UI; active-stream guards for chat events.
- Optional **SPKI certificate pinning** via the `expo-pinned-websocket` native module on iOS and Android; pin discovery (TOFU), pin mismatch handling, and Settings UI to manage pinned gateway keys.
- **Streaming assistant replies** with expandable thinking/reasoning blocks and tool-call cards (pending, running, completed, error).
- **Safe markdown** rendering for assistant content (no raw HTML injection).
- **Session management**: list, create, switch, and reset sessions; slide-out session sidebar with previews.
- **Agents** and **models** pickers wired to gateway catalogs.
- **Slash command palette** (`/`) with server-driven suggestions and **command confirmations** where the gateway requires them.
- **Multiple server profiles**: labeled gateways, per-profile gateway tokens in Secure Store only (never plaintext in AsyncStorage).
- **Connection status** and banners (connecting, pairing required, identity rejected, errors).
- **Settings**: server block (add/edit/remove profiles, logs), appearance (theme mode and dark variants), media-related options, **text-to-speech** controls (auto-speak replies, device vs gateway voice preferences), **About** screen with in-app changelog.
- **Onboarding** flow when no server profile exists yet.
- Optional **ClawBoy cloud identity** (Supabase): Sign in with Apple, Google (OAuth), and **email magic link**; account row in Settings is optional and does not block local-only gateway use; Supabase session tokens stored in Secure Store.
- **Feedback** submission to a configurable proxy endpoint; optional attachment of **recent screenshots** with privacy-conscious client preparation and a **Cloudflare Worker** companion for ingestion (see `infra/feedback-worker/`).
- **Encrypted on-disk chat cache** (AES-GCM) for faster cold-start UX; encryption key in Secure Store.
- **OTA updates** integration (`expo-updates`) with critical-update modal when applicable.
- **Infrastructure as code** for optional Supabase schema and Edge Functions under `infra/supabase/` (accounts, entitlements placeholder, account-delete, founders-related schema, **`purchases-webhook`** for store events), timestamped migrations, and local `supabase/config.toml` for CLI workflows — documented in `infra/supabase/README.md`.
- **Unit tests** (Jest) for protocol/helpers and key UI components; test configuration and mocks aligned with Expo/React Native.
- **Internationalization** (`i18n`): English and Simplified Chinese (`zh-CN`) string catalogs with a `LanguageProvider` and wired copy across onboarding, chat, input, settings, and common UI.
- **Demo mode**: local scripted OpenClaw client, demo storage, in-chat demo banner, and onboarding path to try the UI without a live gateway.
- **In-app purchases** (RevenueCat via `react-native-purchases`): `PurchasesContext`, product helpers, and Settings sections for **Founders** support and an optional **tip jar**; Founders badge for eligible accounts.
- **`serverPointers`** helper and related Supabase types for optional cloud-assisted server profile hints.
- **`ServerProfileSyncContext`**: optional sync path for server profile metadata with Supabase (plus unit tests for pointer resolution).
- **Account settings** screen and richer **Account** section (sign-in, account management) alongside existing Supabase auth flows.
- **Settings pairing card** for device pairing status and actions; **audio playing pill** in chat for inline playback/TTS affordance.
- **Hooks/utilities**: `useThrottledValue` for UI that should not update every frame; onboarding snapshot tests.

### Changed

- Iterative refactors of the OpenClaw WebSocket **client** and **chat** modules for clearer stream handling, typed events, reconnect behavior, and alignment with gateway semantics.
- **UI polish** across chat (headers, banners, bubbles, lists), onboarding, settings (including server block and meta panels), and theme tokens for consistency with the intended design system.
- **Pairing-required** messaging moved out of a dedicated chat surface into **Settings** (`PairingRequiredCard` removed from chat in favor of a settings pairing card).
- **Message list / bubbles**, **slash command palette**, **tool and thinking** cards, **connection banners**, and **input bar** pieces updated for demo mode, i18n, media/audio cues, and layout consistency.
- **Jest** split into **logic** vs **components** projects with shared setup tweaks for faster, clearer test runs.
- **`useServerConfig`** and related settings flows expanded for multi-profile editing, sync, and server-row UX; **`infra/supabase/README`** updated for the new migrations and functions.

### Security

- Gateway tokens, device identity material, Supabase session tokens when used, and chat-cache keys stored via **`expo-secure-store`** rather than AsyncStorage; RLS-oriented Supabase schema documented for cloud tables.
- Certificate pinning and explicit flows when a gateway certificate no longer matches a stored pin.

[Unreleased]: https://github.com/your-org/clawboy-expo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/clawboy-expo/releases/tag/v1.0.0
