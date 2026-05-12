# Security Policy

## Important: What ClawBoy Can Access

ClawBoy connects to **personal OpenClaw gateways**. Depending on how each user has configured their gateway, it may have access to:

- **Email** (Gmail, Outlook, IMAP)
- **Banking and financial accounts**
- **Private files and documents**
- **Home automation and IoT devices**
- **Social media accounts**
- **Calendar, contacts, and personal data**
- **Shell access to their servers**

Security vulnerabilities in ClawBoy are therefore **high-impact**. We take all reports seriously and will respond promptly.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (`main`) | Yes |
| Older releases | Best-effort |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Use **[GitHub private security advisories](https://github.com/openclaw/clawboy/security/advisories/new)** to report vulnerabilities confidentially. If you're unsure whether something qualifies, err on the side of reporting privately.

When reporting, please include:
- A clear description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept if available)
- Any relevant environment details (iOS version, Expo SDK version, gateway version)

We will acknowledge receipt within **72 hours** and aim to ship a fix or mitigation within **14 days** for critical issues.

## What to Report

Please report any issue that could allow an attacker to:

- **Auth bypass** — authenticate to a gateway without valid credentials
- **Credential leak** — expose gateway tokens, device keypairs, or auth tokens outside of `expo-secure-store`
- **Insecure transport** — transmit sensitive data over unencrypted channels (non-TLS)
- **Man-in-the-middle** — intercept or tamper with gateway communication
- **Injection** — execute arbitrary code or commands via crafted gateway responses
- **Device identity compromise** — extract or forge the Ed25519 device keypair
- **Session hijacking** — take over another user's gateway session
- **Data exfiltration** — access another user's messages, tokens, or gateway data

## Credential Safety

**Never post the following in GitHub issues, pull requests, commit messages, or public channels:**

- Gateway URLs (even if they appear internal or local)
- Auth tokens or gateway tokens
- Device keypairs or device tokens
- Any connection credentials

If you accidentally expose credentials in a public issue or PR, **rotate them immediately** from your OpenClaw gateway's device management interface.

## Security Design Principles

ClawBoy is designed with these non-negotiable security properties:

- Auth tokens and device keys are stored in `expo-secure-store` exclusively — never `AsyncStorage`, never console.log, never analytics.
- All gateway connections default to `wss://` (TLS). Plain `ws://` connections trigger a visible warning.
- The Ed25519 device keypair is generated once, stored in secure storage, and never exported or logged.
- All rendered gateway content passes through a safe markdown renderer — no `dangerouslySetInnerHTML` or equivalent.
- All WebSocket frames are validated before acting on them.
