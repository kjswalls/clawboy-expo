# ClawBoy Interactive Options (Inline Reply Buttons)

ClawBoy can render interactive choice buttons below an AI assistant's message, letting the user reply with a single tap instead of typing. A free-form text input is shown alongside the buttons for custom replies.

This is a **ClawBoy-only convention**. Every other OpenClaw client (the web UI, Discord/Telegram bridges, etc.) sees only the prose — the directive is invisible in all standard markdown renderers.

---

## How it works

The AI assistant writes its question as normal prose, then appends a hidden HTML comment containing a JSON payload.

### Example

```
Which database should I set up for this project?

<!-- clawboy:options
{
  "choices": [
    { "label": "PostgreSQL",  "value": "Use PostgreSQL" },
    { "label": "SQLite",      "value": "Use SQLite", "hint": "simpler, file-based" },
    { "label": "MySQL",       "value": "Use MySQL" }
  ],
  "allowFreeText": true,
  "freeTextPlaceholder": "Or describe your own preference…"
}
-->
```

ClawBoy strips the comment and renders a card with three buttons and a free-form input field below the prose. Every other client renders only:

> Which database should I set up for this project?

---

## Schema

```jsonc
{
  // Optional — reinforcing label shown above the buttons in ClawBoy.
  // Usually omitted: the prose body IS the prompt.
  "prompt": "string",

  // Required — at least one entry.
  "choices": [
    {
      "label": "string",   // Button text (required)
      "value": "string",   // Text sent to the gateway on tap (required)
      "hint":  "string"    // Optional subtitle shown under the label
    }
  ],

  // When true, a text input + send button is shown alongside the buttons.
  // Defaults to true.
  "allowFreeText": true,

  // Placeholder for the free-form input.
  // Defaults to "Or type a custom reply…"
  "freeTextPlaceholder": "string"
}
```

---

## Consumed state

A survey is **consumed** as soon as the next user message in the session arrives. ClawBoy determines consumed state at render time by comparing the next user message to the choice values/labels (case-insensitive trim). No extra persistence is needed; this works across `chat.history` reloads and app restarts automatically.

Visual states:
- **Live** — buttons are tappable, free-form input is editable.
- **Consumed / choice matched** — the chosen button is highlighted (accent fill), others are muted. Input is hidden.
- **Consumed / free text** — all buttons are muted, the user's reply is shown in a quote pill below the buttons.

---

## Auto-injection (ClawBoy ≥ 1.x)

Users do **not** need to paste anything into their agents — ClawBoy installs the convention automatically. There are two delivery paths:

1. **`AGENTS.md` install (primary).** On first interaction with an agent, ClawBoy appends a managed section to `AGENTS.md` in the agent's workspace via the `agents.files.set` RPC. The OpenClaw runtime auto-injects `AGENTS.md` into every agent prompt, so the convention is always live with zero per-message overhead. Anything outside the `<!-- clawboy:managed-start -->` / `<!-- clawboy:managed-end -->` markers is preserved byte-for-byte across install / reinstall / uninstall.

2. **Per-session HTML-comment primer (fallback).** When `AGENTS.md` install is declined, fails, or globally disabled, ClawBoy prepends an invisible `<!-- clawboy:client-context ... -->` comment to the first user message of each session, refreshing on session reset and compaction. Other markdown clients ignore it; the agent reads it as part of the user message.

Users choose between these on first connect (`Auto / Ask each / Off`) and can change their mind at any time from **Settings → ClawBoy Conventions**, including a preview of what gets written to `AGENTS.md` and per-agent uninstall.

### Implementation files

- **Convention text:** `src/lib/openclaw/clientContext.ts` — single source of truth (`CLAWBOY_CONVENTION_TEXT`) shared by both paths, plus `buildAgentsMdSection` / `stripAgentsMdSection` and `buildClientContextDirective` / `stripClientContextDirective`.
- **Install RPCs:** `src/lib/openclaw/installConventions.ts` — `ensureAgentsMdInstalled` / `uninstallAgentsMd` wrap `agents.files.get` + `agents.files.set` with marker-aware replace-or-append logic.
- **State:** `src/contexts/ConventionInstallContext.tsx` — per-(profile, agent) install records persisted to AsyncStorage.
- **Settings UI:** `src/components/settings/SettingsConventionsSection.tsx`.
- **Onboarding:** `src/components/onboarding/ConventionInstallSheet.tsx` (one-time on first connect).
- **Send-time injection:** `src/hooks/useChat.ts` — kicks off lazy install + injects fallback primer on first message of a session.

---

## System-prompt snippet (manual fallback)

You should not normally need this — ClawBoy auto-injects the convention via `AGENTS.md`. Paste this only if you want to teach an agent the convention by hand (e.g. on a non-ClawBoy gateway client, or if you turned off auto-install in settings). Adjust the examples for your domain.

```
When you want to offer the user structured reply options, append a hidden HTML
comment at the end of your message using this exact format:

<!-- clawboy:options
{
  "choices": [
    { "label": "Option A", "value": "I want Option A" },
    { "label": "Option B", "value": "I want Option B", "hint": "optional subtitle" }
  ],
  "allowFreeText": true,
  "freeTextPlaceholder": "Or describe your own preference…"
}
-->

Rules:
- Always write the prose question first. The comment must come AFTER the visible text.
- Use a plain JSON object inside the comment. No markdown, no trailing commas.
- Omit "allowFreeText" when you want to force a choice (defaults to true).
- Omit "hint" when no subtitle is needed.
- Use "value" for the text that will be sent back to you as the user's reply.
  Make values descriptive enough to stand alone as a chat message.
- Only include this comment when you genuinely want interactive input. Do not
  use it for rhetorical questions or conclusions.
```

---

## Implementation notes

- **Parser:** `src/lib/openclaw/interactive.ts` — `parseClawboyOptions(text)` and `deriveSurveyState(prompt, nextUserText)`.
- **Component:** `src/components/chat/InteractiveOptionsCard.tsx`.
- **Integration:** parsed at `onMessage` finalization in `src/hooks/useChat.ts` and in `openClawMessageToChat` (history path) in `src/types/index.ts`. Rendered in `src/components/chat/MessageBubble.tsx`.
- **Tests:** `src/lib/__tests__/interactive.test.ts`.
