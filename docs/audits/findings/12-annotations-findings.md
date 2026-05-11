# Audit Findings: Annotations (Plan 12)

**Audited:** 2026-05-11  
**Auditor:** Sonnet 4.6 (subagent)  
**Scope:** `src/lib/annotations.ts`, `src/contexts/AnnotationContext.tsx`, `src/components/chat/AnnotatedMessageBody.tsx`, `src/components/chat/AnnotationLayoutContext.tsx`, `src/components/chat/AnnotationPreviewModal.tsx`, `src/components/chat/AnnotationsPill.tsx`, `src/components/chat/InlineAnnotationRow.tsx`, `src/lib/__tests__/annotations.test.ts`, `src/components/chat/__tests__/InlineAnnotationRow.test.tsx`

---

## Summary

The annotations feature is well-structured and largely clean. `annotations.ts` is a pure TypeScript module with no React imports, well-tested, and the logic is correct. The context layer uses `useMemo` properly. The UI components follow the codebase patterns, use `t()` for all user-visible strings, and render content through the safe `@ronradtke/react-native-markdown-display` markdown renderer.

**One auto-fix was applied** (type mismatch in test fixtures). Seven additional findings are proposed, two of which warrant attention before App Store submission: a missing URL-validation gate in `makeLinkRule` (security) and `AnnotatedMessageBody.tsx` exceeding the 300-line guideline (maintainability).

**Severity counts: C:0 / H:0 / M:2 / L:3 / N:2**

---

## Findings

### annotations-001 — LOW — FIXED
**Type mismatch: `createdAt` in test fixtures**

In `src/components/chat/__tests__/InlineAnnotationRow.test.tsx` (lines 21, 29), `blockAnnotation.createdAt` and `rangeAnnotation.createdAt` were assigned `new Date('2024-01-01T00:00:00Z')` (a `Date` object), but `Annotation.createdAt` is typed as `number` in `src/lib/annotations.ts`. TypeScript strict mode would flag this. Auto-fixed (see below).

---

### annotations-002 — MED — PROPOSED
**`AnnotatedMessageBody.tsx` exceeds 300-line guideline (418 lines)**

The file contains four distinct sub-components — `SectionMarkdown`, `AddCommentRow`, `SectionBlock`, and the exported `AnnotatedMessageBody` — plus inline markdown rule factories. At 418 lines it is 40% over the project's ~300-line cap.

**Proposed split:**
- Extract `SectionMarkdown.tsx` (inline markdown + link rule logic, ~45 lines)
- Extract `AddCommentRow.tsx` (add-comment / add-range affordance buttons, ~40 lines)
- Extract `SectionBlock.tsx` (per-section container with annotation rows, ~65 lines)
- Keep `AnnotatedMessageBody.tsx` as the thin orchestrator that calls `splitMessageIntoBlocks` and maps sections (~80 lines)

Each extracted file is already a discrete unit with a clear interface. No behavioral change required.

---

### annotations-003 — MED — PROPOSED
**URL not validated before `Linking.openURL` in `makeLinkRule`**

In `AnnotatedMessageBody.tsx` at approximately line 72, links in AI-generated message content are opened with:
```typescript
void Linking.openURL(href);
```
There is no protocol validation. A message with a `javascript:`, `data:`, or `vbscript:` URL could trigger unexpected behavior depending on the platform WebView or OS-level URL handler, and a `tel:` / `sms:` URL could silently place a call or send a message.

**Proposed fix:** Add a protocol allowlist guard before calling `Linking.openURL`:
```typescript
const ALLOWED_PROTOCOLS = ['https:', 'http:', 'mailto:'];

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

// In makeLinkRule:
onPress={() => {
  if (!isInternalLink(href) && isSafeUrl(href)) {
    void Linking.openURL(href);
  }
}}
```
The same pattern is already used in other parts of the codebase via `isInternalLink`. Extend it with a protocol check.

*Reference: `.cursorrules` Security §3 (sanitize all rendered content).*

---

### annotations-004 — LOW — PROPOSED
**`AnnotationLayoutContext` — context value object identity churn**

`AnnotationLayoutProvider` constructs `internalValue` as a plain object literal on every render:
```typescript
const internalValue: AnnotationLayoutRegistry = { register, unregister, getRef };
```
Although the three callbacks are stable (`useCallback` with `[]` deps), the wrapper object is a new reference on each render. Because React context compares values by reference, every re-render of `AnnotationLayoutProvider` causes all consumers (`useAnnotationLayout`, `useAnnotationLayoutMaybe`) to re-render unnecessarily.

`AnnotationContext` already does this correctly with `useMemo`. `AnnotationLayoutContext` should match that pattern:
```typescript
const internalValue = useMemo<AnnotationLayoutRegistry>(
  () => ({ register, unregister, getRef }),
  [register, unregister, getRef],
);
```
The same issue exists in `useCreateAnnotationLayoutRegistry`: the returned `{ register, unregister, getRef }` object is a new reference on each call of the hook. Wrap in `useMemo` with `[register, unregister, getRef]`.

This requires adding `useMemo` to the imports in `AnnotationLayoutContext.tsx`.

---

### annotations-005 — LOW — PROPOSED
**Missing test coverage for `AnnotationContext`, `AnnotationPreviewModal`, and `AnnotatedMessageBody`**

The test suite covers `annotations.ts` (pure logic, well-tested) and `InlineAnnotationRow`. No tests exist for:

- `AnnotationContext` — `addAnnotation`, `updateAnnotation`, `removeAnnotation`, `clearAnnotations`, and the critical session-switch behaviour (swapping annotations when `sessionKey` changes)
- `AnnotationPreviewModal` — rendering with empty annotations, rendering with no `quotedText`, the send / close callbacks
- `AnnotatedMessageBody` — section rendering, block vs. range annotation placement, range picker integration

**Proposed additions** (not auto-added per audit rules):
- `src/contexts/__tests__/AnnotationContext.test.tsx` — `renderHook`-based tests for all context mutators and session-switch coverage
- `src/components/chat/__tests__/AnnotationPreviewModal.test.tsx` — snapshot + interaction tests
- `src/components/chat/__tests__/AnnotatedMessageBody.test.tsx` — section rendering, annotation placement

---

### annotations-006 — NIT — PROPOSED
**`InlineAnnotationRow`: `<Pressable>` with no `onPress` for short range annotations**

At `InlineAnnotationRow.tsx` ~line 136, the quote block is unconditionally wrapped in `<Pressable>`:
```tsx
<Pressable
  onPress={isLong ? handleToggleRangeExpand : (isBlock ? handleToggleQuote : undefined)}
  ...
  accessibilityRole={isLong || isBlock ? 'button' : 'text'}
>
```
When `!isBlock && !isLong` (a range annotation with ≤5 lines), `onPress` is `undefined` and `accessibilityRole` is `'text'`. Using a `<Pressable>` as a non-interactive text region adds a touch target and a hover/ripple affordance for no purpose.

**Proposed fix:** Replace with a plain `<View>` for the non-interactive case, or conditionally render `<Pressable>` vs. `<View>`:
```tsx
const QuoteContainer = (isLong || isBlock) ? Pressable : View;
```

---

### annotations-007 — NIT — PROPOSED
**`AnnotationPreviewModal`: no empty-state when all content is absent**

When `prelude` is empty and all annotations have empty/whitespace `quotedText` (filtered out at line 73), the modal renders a scroll area containing nothing, with only the "Send" button visible. A user tapping "Preview" under this degenerate condition sees a confusing empty sheet.

**Proposed fix:** Add a short placeholder when `!prelude.trim() && refCards.length === 0`:
```tsx
{!prelude.trim() && refCards.length === 0 && (
  <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
    {t('chat.annotate.previewEmpty')}
  </Text>
)}
```
Requires a new i18n key `chat.annotate.previewEmpty` (proposed, not auto-added per audit rules).

---

## Auto-fixes Applied

| Finding ID | Severity | Description |
|------------|----------|-------------|
| annotations-001 | low | `InlineAnnotationRow.test.tsx`: changed `createdAt: new Date(...)` to `createdAt: new Date(...).getTime()` on both test fixture objects to match `Annotation.createdAt: number` |

---

## Test Impact

**Tests run after auto-fix:**
```
PASS logic  src/lib/__tests__/annotations.test.ts
PASS components  src/components/chat/__tests__/InlineAnnotationRow.test.tsx

Test Suites: 2 passed, 2 total
Tests:       47 passed, 47 total
Snapshots:   3 passed, 3 total
```
All tests green. No snapshots invalidated.

---

## Exit Criteria

- [x] `docs/audits/findings/12-annotations-findings.md` written
- [x] Severity counts accurate — C:0 / H:0 / M:2 / L:3 / N:2
- [x] All auto-fixable items fixed (annotations-001 applied; no others qualify)
- [x] `npm test` passes — 47/47 tests green
- [x] Row 12 in `docs/audits/README.md` flipped to `done`

**Exit criteria met: yes**
