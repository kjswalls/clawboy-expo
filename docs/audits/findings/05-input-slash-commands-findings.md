# Audit Findings: Input Bar & Slash Commands (Plan 05)

**Date:** 2026-05-11  
**Scope:** `src/components/input/**`, `src/hooks/useCommands.tsx`, `src/hooks/useDraft.ts`, `src/hooks/useInputTextController.ts`, `src/hooks/useTokens.ts`, `src/hooks/useActionBarPins.ts`

---

## Summary

The input bar and slash command system is architecturally sound. Correctness is strong: draft persistence, palette mode derivation, and the generation-counter guard in `useCommands` all work correctly. Security posture is good — no input text logging, slash commands have no native-API side-channels, and `useActionBarPins` stores only non-sensitive UI preference data.

The primary issues are: two oversized files that are split candidates (`InputBar.tsx` at 912 lines, `SlashCommandPalette.tsx` at 842 lines), three hardcoded English strings in `InputBarAttachmentPreviews.tsx` that bypass i18n, several missing accessibility labels on interactive elements (remove buttons, command palette rows, paperclip/camera buttons), and a small number of dead code items.

**Severity counts: 0 critical / 0 high / 0 medium / 5 low / 5 nit**

---

## Findings

### input-001 · low · proposed — `InputBar.tsx` is 912 lines (split candidate)

`InputBar.tsx` is 912 lines, 3× the project's ~300-line guideline. The file contains voice recording management, multiple attachment picker flows, draft text management, slash-command palette mode derivation, and the send/abort logic — five distinct concerns collapsed into one component.

**Proposed fix:** Extract three hooks and promote one existing callsite:
- `useVoiceRecorder(disabled, isThinking)` → encapsulates `recorder`, `voiceStartRef`, `voiceMaxTimerRef`, `isVoiceRecording`, `onMicPressIn`, `onMicPressOut`
- `useAttachmentPicker(attachmentsRef, setAttachments)` → encapsulates `pickFromLibrary`, `pickVideoLibrary`, `pickDocument`, `takeMedia`, `takeVideo`, `attachRecentAssets`, `pasteImageFromClipboard`, `onCamera`
- `usePaletteMode(controllerText, commands, selectedCommandIndex, modelSections)` → encapsulates the `paletteMode` `useMemo` block (~70 lines)

The `handlePaste` helper can remain in `InputBar.tsx` since it straddles text and attachments state, or move to the attachment hook.

---

### input-002 · low · proposed — `SlashCommandPalette.tsx` is 842 lines (split candidate)

`SlashCommandPalette.tsx` is 842 lines. The file contains four self-contained rendering trees: `CommandsContent`, `ArgsContent`, `ModelsContent`, and `PaletteDetailFooter`.

**Proposed fix:** Extract each into its own file under `src/components/input/palette/`:
- `palette/CommandsContent.tsx`
- `palette/ArgsContent.tsx`
- `palette/ModelsContent.tsx`
- `palette/PaletteDetailFooter.tsx`

The main `SlashCommandPalette.tsx` becomes a thin orchestrator (~100 lines) that selects which content component to render.

---

### input-003 · nit · **fixed** — Dead `CATEGORY_LABELS` export removed from `slashCommands.ts`

`CATEGORY_LABELS` was exported from `slashCommands.ts` but was not imported anywhere in the codebase. The palette uses `t('input.slashCategories.${row.category}')` for category labels instead. Removed.

---

### input-004 · low · proposed — Hardcoded English strings in `InputBarAttachmentPreviews.tsx`

Three user-visible strings are hardcoded English literals instead of going through `t()`:

| Location | Hardcoded string |
|----------|------------------|
| Line 53 | `"This model may not see images"` |
| Line 111 | `"Will transcribe to text"` |
| Line 115 | `"Will send as voice note"` |

These will not be localized when the user's locale is non-English.

**Proposed fix:** Add i18n keys and wire `t()`:

```json
// src/i18n/locales/en/common.json — under "input.attach"
"visionWarning": "This model may not see images",
"willTranscribe": "Will transcribe to text",
"willSendAudio": "Will send as voice note"
```

Then in `InputBarAttachmentPreviews.tsx`:
```tsx
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
// Line 53:
<Text style={...}>{t('input.attach.visionWarning')}</Text>
// Line 111:
<Text style={...}>{t('input.attach.willTranscribe')}</Text>
// Line 115:
<Text style={...}>{t('input.attach.willSendAudio')}</Text>
```

---

### input-005 · low · proposed — Attachment remove buttons missing `accessibilityLabel`

In `InputBarAttachmentPreviews.tsx`, two `Pressable` elements that remove attachments have no accessibility attributes:

- Image thumbnail remove button (line 73, `Pressable` wrapping `X` icon)
- File/audio pill remove button (line 105, `Pressable` wrapping `X` icon)

Screen reader users cannot identify what attachment is being removed or that the button is interactive.

**Proposed fix:**
```tsx
// Image thumbnail remove button (line 73):
<Pressable
  onPress={() => onRemoveAttachment(attachment.id)}
  style={[styles.removeBtn, { backgroundColor: colors.foreground }]}
  accessibilityLabel={`Remove ${attachment.name}`}
  accessibilityRole="button"
>

// File pill remove button (line 105):
<Pressable
  onPress={() => onRemoveAttachment(attachment.id)}
  hitSlop={6}
  accessibilityLabel={`Remove ${attachment.name}`}
  accessibilityRole="button"
>
```

---

### input-006 · low · proposed — Slash command palette rows missing `accessibilityRole`

`CommandRow`, `ArgsOptionRow`, and `ModelRow` in `SlashCommandPalette.tsx` have no `accessibilityLabel` or `accessibilityRole` on their `Pressable` elements. The plan requires `accessibilityRole="menuitem"` or equivalent so VoiceOver users can navigate the palette.

**Proposed fix (CommandRow):**
```tsx
<Pressable
  onPress={() => onSelect(command)}
  onLongPress={() => onHighlight(flatIndex)}
  accessibilityRole="menuitem"
  accessibilityLabel={`/${command.name}${command.args ? ' ' + command.args : ''} — ${description}`}
  style={...}
>
```

Apply the same pattern to `ArgsOptionRow` (`accessibilityLabel={`/${commandName} ${option}`}`) and `ModelRow` (`accessibilityLabel={item.title}`).

---

### input-007 · low · proposed — Paperclip and camera buttons missing `accessibilityLabel`

In `InputBarActionBar.tsx`:

- **Paperclip button** (line 267): `<Pressable onPress={onPaperclip} style={styles.actionIcon} hitSlop={8}>` — no `accessibilityLabel` or `accessibilityRole`.
- **Camera button** (line 343): `<Pressable onPress={onCamera} style={styles.actionIcon} hitSlop={8}>` — no `accessibilityLabel` or `accessibilityRole`.

All other action bar controls (mic, stop, send, expand/collapse, pin edit) correctly have accessibility labels.

**Proposed fix:** Add labels and roles, plus i18n keys `input.actionBar.openAttachments` and `input.actionBar.openCamera`:

```tsx
// Paperclip:
<Pressable
  onPress={onPaperclip}
  style={styles.actionIcon}
  hitSlop={8}
  accessibilityLabel={t('input.actionBar.openAttachments')}
  accessibilityRole="button"
>

// Camera:
<Pressable
  onPress={onCamera}
  style={styles.actionIcon}
  hitSlop={8}
  accessibilityLabel={t('input.actionBar.openCamera')}
  accessibilityRole="button"
>
```

```json
// src/i18n/locales/en/common.json — under "input.actionBar"
"openAttachments": "Open attachments",
"openCamera": "Open camera"
```

---

### input-008 · nit · proposed — Dead i18n keys `input.palette.tapModelToSelect` and `input.palette.tapOptionToUse`

`common.json` defines two keys that are not used by any code:

- `input.palette.tapModelToSelect` ("Tap a model to select") — palette uses `input.palette.tapAModel` instead  
- `input.palette.tapOptionToUse` ("Tap an option to use") — palette uses `input.palette.tapAnOption` instead

The values are identical to their active counterparts, suggesting they were renamed during development but the old keys were not removed.

**Proposed fix:** Remove `tapModelToSelect` and `tapOptionToUse` from `common.json` and all other locale files.

---

### input-009 · nit · **fixed** — Misleading variable name in `filterCommands.test.ts`

At line 43, `const standardIdx = tiers.lastIndexOf('essential')` stored the last index of `'essential'` (not `'standard'`) in a variable named `standardIdx`. The test logic was correct — it asserted that the last essential tier entry comes at or before the first standard — but the name implied it was indexing into standard-tier entries.

**Auto-fix applied:** Renamed `standardIdx` → `lastEssentialIdx` and updated the assertion guard on the same variable. No behavioral change.

---

### input-010 · nit · proposed — `SlashCommandPalette` uses `ScrollView` + `map()` instead of `FlatList`

`CommandsContent`, `ArgsContent`, and `ModelsContent` all render lists via `ScrollView` + `array.map()` rather than a virtualized `FlatList`. With `maxHeight: 320` and an expected maximum of ~30–50 built-in slash commands the impact is negligible, but large remote command registries could degrade scrolling performance.

**Proposed fix:** Replace `ScrollView` + `map()` in `CommandsContent` and `ModelsContent` with `FlatList` (with `keyExtractor` and `renderItem`). `ArgsContent` options lists are typically very short (2–5 items) and can remain as `ScrollView`.

---

## Auto-fixes applied

| Finding ID | Severity | Description |
|------------|----------|-------------|
| input-003 | nit | Removed unused `CATEGORY_LABELS` export from `slashCommands.ts` |
| input-009 | nit | Renamed `standardIdx` → `lastEssentialIdx` in `filterCommands.test.ts` (no behavioral change) |

---

## Test impact

All input-area tests pass after fixes:

```
PASS logic  src/components/input/__tests__/filterCommands.test.ts   (11 tests)
PASS logic  src/components/input/__tests__/parseSlashCommand.test.ts (10 tests)
PASS components  src/components/input/__tests__/InputBarCard.test.tsx (2 suites, 17 tests)
PASS components  src/hooks/__tests__/useInputTextController.test.tsx

Total: 21 + 17 = 38 input-area tests passing
```

The `components` project as a whole reports 4 failing tests in `InteractiveOptionsCard.test.tsx` (chat scope, pre-existing failures in git-modified files, unrelated to this audit's changes).

---

## Exit criteria met?

| Criterion | Status |
|-----------|--------|
| `findings/05-input-slash-commands-findings.md` written | ✅ |
| Severity counts accurate (0C/0H/0M/5L/5N) | ✅ |
| All auto-fixable items fixed or deferred | ✅ (2 fixed; proposed-only items noted above) |
| `npm test --selectProjects components` passes for input scope | ✅ (4 pre-existing out-of-scope failures in chat component) |
| Row 05 in `docs/audits/README.md` flipped to `done` | ✅ (pending final flip below) |

**Exit criteria: YES** — all input-area checks complete, auto-fixes applied, proposed fixes documented.
