# ClawBoy — App Store Review Notes

*Source text for App Store Connect → App Review Information → Review Notes field.*
*Update before each major submission. Plain text, ≤4000 characters recommended.*

---

## Review Notes (copy-paste into App Store Connect)

```
ClawBoy is a native iOS client for OpenClaw, an open-source AI agent gateway platform. It is a thin client — it connects to a user-configured server (the OpenClaw gateway) over WebSocket and provides a chat interface for AI agents running on that server.

--- DEMO MODE (no gateway required) ---
Reviewers do not need a live gateway to evaluate the app. On the onboarding / connect screen, tap "Try Demo" to launch a fully functional offline demo session. Demo mode provides pre-scripted chat messages, tool calls, thinking blocks, session switching, and settings, with no network connection required.

--- WHAT THE APP DOES ---
1. Chat: Users send messages to AI agents hosted on their own OpenClaw gateway. Responses stream in real time with thinking blocks and tool call cards.
2. Session management: Users can create, switch, and reset conversation sessions.
3. Server profiles: Users configure their own gateway URL and authentication token. The app stores credentials in the iOS Keychain only — never in plain storage or on our servers.
4. In-app purchases: Not available in this version. Optional Pro / Founders Edition purchases will ship in a future update via StoreKit; there is no Restore Purchases UI in this build.
5. Account (optional): Sign in with Apple or Google to sync server profile pointers across devices. Account creation is not required to use the app.

--- GUIDELINE 4.7 (remote code/content) ---
ClawBoy does not load or execute remote code. It renders text and markdown from the connected gateway through @ronradtke/react-native-markdown-display (no HTML injection, no dangerouslySetInnerHTML equivalent). Over-the-air updates are delivered exclusively through Expo's signed OTA system (the same mechanism used by thousands of Expo apps on the App Store) and are code-signed with a local certificate before executing. The app does not load arbitrary JavaScript from the gateway or any other remote source.

--- GUIDELINE 1.2 (user-generated / AI content) ---
Content displayed in the app originates from AI agents running on the user's own self-hosted gateway. The user selects the model and controls the gateway. Sunday Softworks does not operate any AI model or gateway and never sees message content. Users can report objectionable AI responses via Settings → "Report a bug / Request a feature". Terms of Service Section 7 prohibits use of the app for illegal or harmful purposes.

--- ENCRYPTION ---
ITSAppUsesNonExemptEncryption = false. Encryption used: TLS (OS-provided), Ed25519 device authentication signing (auth use only, private key never leaves device), AES-256-GCM local cache encryption (on-device data protection). All uses are exempt under EAR §740.17(b)(1).

--- ACCOUNT DELETION ---
Settings → Account → Delete Account permanently deletes the Supabase account and all server-side data. This path is accessible in two taps from Settings.
```

---

## Demo Account Credentials (fill in before submission)

If providing a live gateway in addition to demo mode, fill in this section and append to review notes:

```
--- OPTIONAL LIVE GATEWAY (for reviewers who want to test with a real connection) ---
Gateway URL: [INSERT REVIEW GATEWAY URL - e.g. https://review.clawboy.app]
Auth Token: [INSERT LONG-LIVED REVIEW TOKEN]
Note: This gateway is hosted solely for App Store review purposes and connects to a sandboxed OpenClaw instance with a pre-configured AI agent. It is available 24/7 during the review window.
```

*If demo mode fully satisfies review, leave the live gateway section empty in App Store Connect.*

---

## Common Rejection Risk Pre-empts

### Guideline 4.7 — Mini-apps / arbitrary code

Risk: reviewer flags custom gateway URL input as a "mini-app loader" or remote code executor.

Pre-empt already in review notes above. If rejected:

1. Clarify that the WebSocket connection delivers only JSON-serialized text/tool-call events, not executable code.
2. Offer to add a reviewer-visible banner in the server-add UI explicitly stating "Server responses are displayed as text. No code is loaded or executed from the server."

### Guideline 1.2 — AI-generated content moderation

Risk: reviewer asks how objectionable AI content is prevented.

Pre-empt already in review notes. If rejected:

1. Emphasize user-controlled gateway (user is the publisher).
2. Point to Terms §7 + in-app bug report path.
3. Consider adding a brief "Content Responsibility" tooltip in the onboarding flow.

### Guideline 5.1.2 — Account required for basic functionality

Risk: reviewer triggers sign-in requirement before chat works.

The app must allow demo mode without sign-in. Verify the onboarding → demo flow never prompts for sign-in and that core chat functionality is fully available without an account.

### Guideline 3.1.1 — Restore Purchases not visible

Risk: reviewer cannot find the restore path.

**This submission (`PURCHASES_ENABLED = false`):** The app does not sell digital goods; Apple does not require a visible Restore Purchases control. The copy-paste Review Notes above already state that IAP is not in this version.

**Future IAP-enabled submission:** Surface Restore Purchases from a logical location (e.g. Settings → Account → edition section). If the reviewer is not signed in, Restore should still be discoverable per Apple’s expectations for paid apps.

### Guideline 2.1 — App Completeness

Risk: reviewer sees placeholder UI, broken screens, or missing features.

All screenshots must show real content. Demo mode must cover all major screens. Never submit with `PURCHASES_ENABLED = false` if the App Store listing advertises purchase features.

---

## Character Count Note

App Store Connect limits Review Notes to approximately 4,000 characters. The base text above is ~2,100 characters. Append demo credentials and optional live gateway section as needed within the limit.