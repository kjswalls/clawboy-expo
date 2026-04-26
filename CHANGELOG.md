##### Changelog

All notable changes to ClawBoy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

##### [Unreleased]

_No unreleased changes yet._

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
