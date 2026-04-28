##### Changelog

All notable changes to ClawBoy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

##### [Unreleased]

###### Added

- Native `expo-pinned-websocket` module with SPKI certificate pinning on iOS and Android for gateway connections.
- Settings UI to view, add, and manage pinned gateway certificate keys, plus a dedicated flow when a connection pin no longer matches (TOFU updates).
- Chat and connection surfacing for identity rejection during pairing, alongside clearer pairing-required guidance.
- Text-to-speech: settings for auto-speaking assistant replies, device vs server voice preferences, and helpers to extract speakable text from streamed content.
- Slash command palette and input bar improvements, including command confirmations where appropriate.
- Feedback submission can attach recent screenshots (with supporting worker and client plumbing).
- Internal design notes for session reset markers and pinning follow-up work under `docs/plans/`.

###### Changed

- Substantial refactor of the OpenClaw WebSocket client and chat protocol layer for clearer stream handling, reconnect behavior, and typed events.
- Chat list, message bubbles, onboarding, About, and theme tokens updated for the above features and general UI polish.
- Supabase client/auth integration refinements; encrypted chat cache and session hooks extended alongside connection context.
- Feedback Cloudflare Worker and related README updates for the expanded feedback payload.
- Additional unit tests, Jest config tweaks, and mocks (including safe-area) for the new behavior.

---

##### [1.0.0] - 2026-04-23

###### Added

- Initial release of ClawBoy — native iOS chat client for OpenClaw.
- Real-time chat with streaming text, thinking nodes, and tool call cards.
- Session management: list, create, switch, and reset sessions.
- Device pairing via Ed25519 challenge-response handshake.
- Exponential-backoff reconnection with background reconnect on app resume.
- Agent and model selector (DeepSeek, Gemini, Claude, and more).
- Slash command palette (`/`) with server-side command autocomplete.
- Multiple server profiles with per-profile auth tokens stored in Secure Store.
- Encrypted on-disk chat cache via AES-256-GCM with per-device key.
- Dark mode (default) and light mode.
- Settings screen: server management, appearance, and gateway logs.
- Onboarding screen for first-time server setup.

[Unreleased]: https://github.com/your-org/clawboy-expo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/clawboy-expo/releases/tag/v1.0.0
