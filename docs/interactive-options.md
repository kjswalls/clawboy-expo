# ClawBoy Interactive Options (Inline Reply Buttons)

ClawBoy can render interactive choice buttons below an AI assistant's message, letting the user reply with a single tap instead of typing. A free-form text input is shown alongside buttons for custom replies.

This is a **ClawBoy-only convention**. Every other OpenClaw client (the web UI, Discord/Telegram bridges, etc.) sees only the prose — the directive is invisible in all standard markdown renderers.

---

## How it works

The AI assistant writes its question(s) as normal prose, then appends a hidden markdown link-reference definition containing a JSON payload. Every standard renderer (markdown-it, the OpenClaw web UI, GitHub, Discord, Telegram, Slack) ignores link-reference definitions that are never used as links — so the directive is invisible everywhere except ClawBoy, which reads it to display the card.

### Single question

```
Which database should I set up for this project?

[clawboy-options]: <data:application/json,{"choices":[{"label":"PostgreSQL","value":"Use PostgreSQL"},{"label":"SQLite","value":"Use SQLite","hint":"simpler, file-based"},{"label":"MySQL","value":"Use MySQL"}],"allowFreeText":true,"freeTextPlaceholder":"Or describe your own preference…"}>
```

ClawBoy renders a card with three labeled buttons (A / B / C) and a free-form input field. Every other client renders only:

> Which database should I set up for this project?

### Multiple questions (paginated card)

```
Before we proceed, I have a few quick questions:

[clawboy-options]: <data:application/json,{"questions":[{"id":"agent_id","prompt":"Agent id — pick now, can't easily rename","choices":[{"label":"twinkle","value":"twinkle"},{"label":"glow","value":"glow"},{"label":"partner","value":"partner"},{"label":"guest1","value":"guest1"}],"allowFreeText":true,"freeTextPlaceholder":"Or her actual name / nickname…"},{"id":"workspace_dir","prompt":"Workspace dir name — match the agent id or different?","choices":[{"label":"Match agent id","value":"match"},{"label":"Different","value":"different"}]},{"id":"user_md","prompt":"USER.md stub or blank? Default = blank.","choices":[{"label":"Blank (default)","value":"blank"},{"label":"Stub","value":"stub"}]}]}>
```

ClawBoy renders a **paginated card** (mirroring Cursor's AskQuestion UI):

- Header shows "1 of 3" with up/down chevrons to navigate between questions.
- Each page shows that question's prompt, A/B/C/D buttons, and optionally a free-text row.
- Footer row: **`[↷ Skip]  · · ·  [→ Send]`**
  - **Skip** advances the cursor to the next question (wrapping) and clears that question's answer (marks it `null` on send). Convenient for skipping questions without leaving the chevron header.
  - **Progress dots** (center) show answered status — filled accent color when answered, muted when current, border-only when untouched.
  - **Send** is enabled as soon as any question has an answer; skipped questions arrive as `null` in the answers payload.
- For single-question cards the footer shows **`[⤺ Clear]  [→ Send]`** — Clear resets the selection and hides itself until the user answers again.
- All questions are optional — the user can skip any question and still send.
- The user can also ignore the card entirely and use the main chat input.

---

## Schema

### Single-question form (legacy, backward-compatible)

```jsonc
{
  // Optional reinforcing label shown above the buttons.
  // Usually omitted — the prose body IS the prompt.
  "prompt": "string",

  // Required — at least one entry.
  "choices": [
    {
      "label": "string",   // Button text (required)
      "value": "string",   // Text sent to the gateway on tap (required)
      "hint":  "string"    // Optional subtitle shown under the label
    }
  ],

  // When true, a free-text input is shown alongside the buttons. Default: true.
  "allowFreeText": true,

  // Placeholder for the free-form input.
  "freeTextPlaceholder": "string"
}
```

### Multi-question form

```jsonc
{
  "questions": [
    {
      "id": "agent_id",              // Required — stable camelCase slug used as answer key
      "prompt": "string",            // Question text shown above choices (recommended)
      "choices": [ ... ],            // Same shape as above
      "allowFreeText": true,         // Per-question override (default true)
      "freeTextPlaceholder": "..."   // Per-question placeholder
    },
    // ... more questions
  ]
}
```

**Rules for `id`:**
- Must be a stable camelCase (or snake_case) identifier — you receive it back as the answer key.
- Avoid spaces, slashes, or punctuation.
- ClawBoy auto-assigns `q1`, `q2`, … when `id` is omitted, but providing explicit ids is strongly preferred so you can reliably parse answers.

---

## Reply format (multi-question)

When the user sends their answers, ClawBoy emits **one user message** structured as:

```
[clawboy-answers]: <data:application/json;base64,BASE64_JSON>

1. Agent id — pick now, can't easily rename: twinkle
2. Workspace dir name — match the agent id or different?: Match agent id
3. USER.md stub or blank? Default = blank.: (skipped)
```

- The hidden link-ref carries the machine-readable JSON keyed by `question.id`. `null` = skipped.
- The visible numbered list uses each question's `prompt` and either the chosen `choice.label`, the freeform text, or `(skipped)`.
- The link-ref is invisible to all markdown renderers — Discord, web UI, Telegram, etc. see only the numbered list.
- Single-question replies use a synthetic `_single` key (you can still parse the readable summary).

---

## Consumed state

A card is **consumed** as soon as the next user message in the session arrives. ClawBoy determines per-question consumed state at render time by:

1. Parsing the `[clawboy-answers]` link-ref in the next user message (precise, per-id).
2. Falling back to the legacy label/value match for old single-question history that predates the answers directive.

Visual states per question:
- **Live** — buttons are tappable, free-form input editable.
- **Consumed / choice matched** — the chosen button is highlighted (accent fill), others are muted.
- **Consumed / free text** — all buttons are muted, user's reply shown in a quote pill.
- **Consumed / skipped** — all buttons are muted, "(skipped)" label shown below the choices.

The card can still be navigated after it is consumed (for review) but no interaction is possible.

---

## Auto-injection (ClawBoy ≥ 1.x)

Users do **not** need to paste anything into their agents — ClawBoy installs the convention automatically via two paths:

1. **`AGENTS.md` install (opt-in).** On first interaction with an agent, ClawBoy appends a managed section to `AGENTS.md` via `agents.files.set`. The OpenClaw runtime auto-injects `AGENTS.md` into every agent prompt. Enable via **Settings → Inline Reply Controls → Auto**.
2. **Per-session HTML-comment primer (default).** ClawBoy prepends an invisible `<!-- clawboy:client-context ... -->` block to the first user message of each session. Other clients ignore it; the agent reads it as part of the user message.

Version: `CONVENTION_VERSION = 6` — v6 migrates the convention from HTML-comment examples to markdown link-reference definitions, eliminating raw comment text in the OpenClaw web chat and other non-ClawBoy clients. Triggers `AGENTS.md` reinstall on next session open.

---

## System-prompt snippet (manual fallback)

Paste this only if you want to manually teach an agent the convention (ClawBoy installs it automatically via the primer or AGENTS.md).

```
Interactive cards are the primary way to ask the user questions in ClawBoy. Use a
card for every confirmation, picker, or multi-step setup — not plain-prose questions.
Cards render as tappable UI in ClawBoy and degrade to readable text elsewhere.

Append a markdown link-reference definition after your prose:

[clawboy-options]: <data:application/json,{"choices":[{"label":"Yes","value":"Yes please"},{"label":"No","value":"No thanks"}]}>

Multiple questions (paginated card — user answers all, sends once):

[clawboy-options]: <data:application/json,{"questions":[{"id":"q1","prompt":"First question?","choices":[{"label":"A","value":"a"},{"label":"B","value":"b"}]},{"id":"q2","prompt":"Second question?","choices":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]}]}>

Replies arrive as a numbered list (a hidden link-ref carries the machine-readable JSON):

1. First question?: A
2. Second question?: (skipped)

Keys match your ids. null = skipped.

Rules:
- Prose first, directive last.
- label = button text. value = sent back verbatim — make it standalone-readable.
- id = stable camelCase slug, returned as the answer key.
- allowFreeText defaults true; set false to force a button choice.
- JSON only — no trailing commas, no markdown inside.
- String values must not contain a literal > character.
- Use for: every yes/no, confirmation, picker, setup step.
  Avoid for: open-ended brainstorming, >5 choices, final summaries.
```

---

## Legacy format (HTML comments)

Prior to v6, the convention used HTML comments:

```
<!-- clawboy:options
{"choices":[{"label":"Yes","value":"Yes please"},{"label":"No","value":"No thanks"}]}
-->
```

ClawBoy still parses this form for backward compatibility with existing message history. New agents should use the link-reference form above — HTML comments are not reliably stripped by all renderers (the OpenClaw web chat renders them as raw text).

---

## Implementation files

- **Types + parser:** `src/lib/openclaw/interactive.ts` — `ClawboyQuestion`, `ClawboyOptionsPrompt`, `normalizeToQuestions`, `parseClawboyOptions`, `parseClawboyAnswers`, `stripClawboyAnswersForRender`, `deriveMultiSurveyState`, `composeAnswersMessage`.
- **Convention text:** `src/lib/openclaw/clientContext.ts` — `CLAWBOY_CONVENTION_TEXT` (v4).
- **Component:** `src/components/chat/InteractiveOptionsCard.tsx`.
- **Integration (history):** `openClawMessageToChat` in `src/types/index.ts`.
- **Integration (streaming finalize):** `src/hooks/useChat.ts`.
- **Integration (render pass):** `app/index.tsx` — second `uiMessages` pass via `deriveMultiSurveyState`.
- **Rendered in:** `src/components/chat/MessageBubble.tsx`.
- **Tests:** `src/lib/__tests__/interactive.test.ts`, `src/components/chat/__tests__/InteractiveOptionsCard.test.tsx`.
