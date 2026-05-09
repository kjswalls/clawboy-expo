# Audit Plan: Input Bar & Slash Commands

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/05-input-slash-commands-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/components/input/**
src/hooks/useCommands.tsx
src/hooks/useDraft.ts
src/hooks/useInputTextController.ts
src/hooks/useTokens.ts
src/hooks/useActionBarPins.ts
src/components/input/__tests__/**
src/hooks/__tests__/ (input-related files)
```

## 2. Out of Scope

- `src/lib/openclaw/commands.ts` — covered in plan 01
- `src/lib/attachments/` — covered in plan 11
- All other files not listed
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rule 3 (sanitize rendered content); **Tech Stack** (no heavy UI library)
2. `docs/plans/at-mentions-slash-commands.md` — slash command design
3. `docs/audits/_CHECKLIST.md`
4. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Slash command palette appears reliably on `/` input and dismisses on clear/send/escape
- [ ] Palette filters commands correctly as user types after `/`
- [ ] Selecting a command from palette inserts full command text, positions cursor correctly
- [ ] Draft persistence: `useDraft` saves and restores draft per session correctly across session switches
- [ ] Token counter (`useTokens`) does not block input or cause noticeable lag on large messages
- [ ] Action bar pins (`useActionBarPins`) persists correctly and survives app restart
- [ ] `InputBar` height adjusts correctly for multi-line input (no text hidden behind keyboard)
- [ ] Send button disabled state: correct during streaming, no-op on empty input
- [ ] Attachment previews: tapping remove correctly clears attachment from pending state

### Security (area-specific)

- [ ] Input text is NOT logged to console at any verbosity level
- [ ] Slash command execution: commands do not have access to arbitrary native APIs — validate command payloads before dispatch
- [ ] Paste input: pasted images go through `expo-paste-input` safely, no arbitrary file access

### Performance (area-specific)

- [ ] `InputBar` does not re-render entire message list when user types (verify context/state isolation)
- [ ] `SlashCommandPalette` list uses `FlatList` or similar for long command lists — not a raw map
- [ ] Token estimation is debounced — not called on every keystroke synchronously

### Cleanliness / Maintainability (area-specific)

- [ ] `InputBar.tsx` under ~300 lines; flag split candidates (`InputBarActionBar`, `InputBarAttachmentPreviews`, etc. already extracted — verify they are not re-merged)
- [ ] `useInputTextController.ts` single-responsibility (text state only, no chat sending logic)
- [ ] `slashCommands.ts` is a static data/config file, no side effects

### Tests (area-specific)

- [ ] Slash command filtering logic has unit tests
- [ ] Draft save/restore has unit tests

### OSS-Readiness (area-specific)

- [ ] No hard-coded slash command list with internal tooling names
- [ ] No developer-only debug commands exposed in production build

### i18n / Accessibility (area-specific)

- [ ] `TextInput` placeholder text uses `t()` key
- [ ] Send button has `accessibilityLabel` and `accessibilityRole="button"`
- [ ] Attachment remove button has `accessibilityLabel`
- [ ] Slash command palette items have `accessibilityRole="menuitem"` or equivalent

## 5. Deliverable

Write output to: `docs/audits/findings/05-input-slash-commands-findings.md`

Finding IDs: `input-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/05-input-slash-commands-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects components` passes
- [ ] Row 05 in `docs/audits/README.md` flipped to `done`
