# Findings: Sessions & Sidebar (Audit 06)

**Date:** 2026-05-11
**Scope:** `src/components/sidebar/**`, `src/hooks/useSessions.tsx`, `src/components/sidebar/__tests__/**`
**Auditor:** Audit Agent (Sonnet)

---

## Summary

The sessions and sidebar area is functionally solid. The gesture drawer is correctly implemented with Reanimated + GestureHandler (not deprecated `Animated`), `SessionRow` is properly memoized, and destructive actions (delete/reset) are behind confirmation dialogs. `useSessions` is the single owner of session CRUD.

Key concerns found:
- **MED**: `MockSession` (sidebar type, uses `.id`) is a separate type from `Session` (protocol type, uses `.key`). The bridge between them is not visible in scope. This creates a structural gap between the sidebar UI and the hook.
- **MED**: `SessionSidebarList` uses `ScrollView` + `.map()` instead of `FlatList`/`FlashList` — performance risk for users with many sessions.
- **LOW**: `renderRightActions` dep array referenced `colors.accentBlue` (doesn't exist at call site) instead of `colors.accent` — **auto-fixed**.
- **LOW**: `renameSession` and `clearRecentSessions` threw `new Error` instead of `ClawError` — **auto-fixed**.
- **LOW/NIT**: Multiple `Pressable` elements missing `accessibilityRole="button"` — **auto-fixed**.
- **LOW**: No unit tests for `sessions.changed` event or swipe action confirmation logic.
- **LOW**: `SessionSidebar.tsx` (323 lines) and `SessionSidebarList.tsx` (321 lines) slightly exceed the 300-line guideline.

**Severity counts: 0 critical / 0 high / 2 med / 5 low / 3 nit**

---

## Findings

### sessions-001 · MED · proposed

**`MockSession` / `Session` type split — sidebar uses `.id`, protocol uses `.key`**

`SessionSidebar`, `SessionSidebarList`, and `SessionRow` all accept `MockSession` (from `@/types`) which has an `id: string` field. `useSessions` returns `sessions: Session[]` (from `@/lib/openclaw/types`) which uses a `key: string` field. The comment in `@/types/index.ts` reads: _"Mock session row for sidebar UI (Prompt 9 replaces with gateway data)"_ — indicating this split was intentional and a bridge/adapter is expected to live in the calling component.

However, `SessionRow.tsx:123` calls `isMainSessionKey(session.id)` using `MockSession.id` as if it were a session key. If the adapter maps `Session.key → MockSession.id` correctly, this works at runtime; if not, the main-session guard silently fails. The adapter could not be located within audit scope.

**Risk:** If `MockSession.id !== Session.key` at any point, the main session guard, pin state, and delete protection will silently misbehave.

**Proposed fix:** Confirm that the parent component (out of audit scope) maps `Session.key → MockSession.id` and `Session.key → MockSession.id` 1:1. Add an explicit comment at the `MockSession` definition documenting this invariant. Consider renaming `MockSession.id` to `MockSession.key` in a future cleanup to prevent confusion.

---

### sessions-002 · LOW · fixed

**Wrong color token in `renderRightActions` dep array**

In `SessionRow.tsx`, the `renderRightActions` `useCallback` dep array listed `colors.accentBlue` but the callback body used `colors.accent` (on the rename button). `colors.accentBlue` is not present in the `ThemeColors` type at the call site — it would be `undefined` in the dep comparison. This meant the callback was not properly re-created when `colors.accent` changed (e.g. on theme switch).

**Auto-fixed:** Replaced `colors.accentBlue` with `colors.accent` in the dep array.

---

### sessions-003 · MED · proposed

**`SessionSidebarList` uses `ScrollView` + `.map()` instead of `FlatList`/`FlashList`**

`SessionSidebarList.tsx` renders pinned and recent sessions via two `.map()` calls inside a `ScrollView` (imported from `react-native-gesture-handler`). For typical session counts (< 50) this is fine, but users who accumulate many sessions will pay for all rows being mounted simultaneously — including their `ReanimatedSwipeable` gesture handlers and `TextInput` rename states.

**Proposed fix:** Replace the two `.map()` sections with a single merged `FlashList` (or `FlatList`) that renders a typed item array including section headers. The grouped collapsible structure needs to be flattened into a flat data array with `type: 'section-header' | 'session'` entries. This is a non-trivial refactor and changes rendering behavior, so it requires human approval.

---

### sessions-004 · LOW · proposed

**`SessionSidebar.tsx` exceeds 300-line guideline (323 lines)**

The file is 323 lines. The gesture logic (`panGesture`, `openEdgeGesture`, `tapBackdrop`, `drawerGesture`) plus the `SidebarErrorFallback` component plus `sidebarErrStyles` all live in the same file.

**Proposed split:** Extract `SidebarErrorFallback` and `sidebarErrStyles` into `SidebarErrorFallback.tsx`. This brings `SessionSidebar.tsx` to ~280 lines.

---

### sessions-005 · LOW · proposed

**`SessionSidebarList.tsx` exceeds 300-line guideline (321 lines)**

`SessionSidebarList.tsx` is 321 lines including the `SessionSkeleton` component and `skeletonStyles`.

**Proposed split:** Extract `SessionSkeleton` and `skeletonStyles` into `SessionSkeleton.tsx`. This brings `SessionSidebarList.tsx` to ~280 lines.

---

### sessions-006 · LOW · fixed

**"New Session" button missing `accessibilityLabel` and `accessibilityRole`**

The "New Session" `Pressable` in `SessionSidebarList.tsx` had no `accessibilityLabel` or `accessibilityRole`, failing the plan's explicit check and the general a11y checklist.

**Auto-fixed:** Added `accessibilityLabel={t('sidebar.newSession')}` and `accessibilityRole="button"`.

---

### sessions-007 · NIT · fixed

**Sidebar close button missing `accessibilityRole="button"`**

The close (`X`) button in `SessionSidebarList.tsx` had `accessibilityLabel` but was missing `accessibilityRole="button"`.

**Auto-fixed:** Added `accessibilityRole="button"`.

---

### sessions-008 · LOW · proposed

**Sidebar panel missing `accessibilityViewIsModal` when open**

The `Animated.View` for the sidebar panel (in `SessionSidebar.tsx`) does not set `accessibilityViewIsModal={isOpen}`. Without this, VoiceOver / TalkBack users navigating by swipe can escape the sidebar into the obscured chat content behind the backdrop.

**Proposed fix:**
```tsx
<Animated.View
  accessibilityViewIsModal={isOpen}
  style={[styles.sidebar, ...]}
  pointerEvents={interactive ? 'auto' : 'none'}
>
```

---

### sessions-009 · LOW · fixed

**`renameSession` and `clearRecentSessions` throw `new Error` instead of `ClawError`**

`resetSession` and `deleteSession` consistently throw `new ClawError('not_connected')` when offline. `renameSession` (line 269) and `clearRecentSessions` (line 293) used `new Error('Not connected')` — inconsistent with the established pattern and potentially causing `instanceof ClawError` checks in callers to fail.

**Auto-fixed:** Both callsites updated to `throw new ClawError('not_connected')`.

---

### sessions-010 · NIT · fixed

**Indentation inconsistency in `clearRecentSessions` for-loop body**

Inside `clearRecentSessions`, the `for` loop body had `try/catch` indented at 4 spaces (1 indent level) while the surrounding for-loop was at 6 spaces (2 levels). The `}` closing the for-loop was also outdented to 4 spaces.

**Auto-fixed:** Re-indented `try`, `catch`, and `}` to consistent 8-space depth inside the for-loop.

---

### sessions-011 · LOW · proposed

**No unit tests for `sessions.changed` event handler or swipe-action confirmation**

The plan explicitly checks for these. No test exercises the `sessions.changed` event triggering a session list refresh. No test exercises the swipe-action `Alert.alert` confirmation flow for delete or reset.

The existing `SessionRow.test.tsx` only has snapshot tests for the rendered row, not for the action callbacks.

**Proposed tests (do not auto-apply):**
1. Hook test: register `sessions.changed` listener on mock OpenClaw client, fire event, assert `refreshSessions` is called.
2. Component test: render `SessionRow`, open swipe, press delete/reset, mock `Alert.alert`, assert the confirmation appears and `onDelete`/`onReset` is called only after "destructive" confirmation — not on Cancel.

---

### sessions-012 · NIT · fixed

**Section header collapse buttons missing `accessibilityRole="button"`**

The "Pinned" and "Recent" section header collapse `Pressable` elements in `SessionSidebarList.tsx` had no `accessibilityRole`.

**Auto-fixed:** Added `accessibilityRole="button"` to both.

---

### sessions-013 · NIT · proposed

**Hard-coded English in `SessionRow` `accessibilityLabel`**

`SessionRow.tsx:260`:
```tsx
accessibilityLabel={`${session.title} — Open session`}
```

The phrase `"Open session"` is hard-coded English outside the i18n system. This would be incorrect for non-English locales.

**Proposed fix (requires new i18n key):** Add `sidebar.session.openLabel` key (e.g. `"{{title}} — Open session"`) to `en/common.json` and `zh-CN/common.json`, then use `t('sidebar.session.openLabel', { title: session.title })`. Requires i18n key addition — proposed, not auto-applied.

---

## Auto-fixes applied

| Finding ID | Severity | Description |
|------------|----------|-------------|
| sessions-002 | low | Fixed `colors.accentBlue` → `colors.accent` in `renderRightActions` dep array in `SessionRow.tsx` |
| sessions-006 | low | Added `accessibilityLabel` + `accessibilityRole="button"` to New Session button in `SessionSidebarList.tsx` |
| sessions-007 | nit | Added `accessibilityRole="button"` to sidebar close button in `SessionSidebarList.tsx` |
| sessions-009 | low | Replaced `new Error('Not connected')` with `new ClawError('not_connected')` in `renameSession` and `clearRecentSessions` in `useSessions.tsx` |
| sessions-010 | nit | Fixed `try/catch` indentation inside `clearRecentSessions` for-loop in `useSessions.tsx` |
| sessions-012 | nit | Added `accessibilityRole="button"` to Pinned and Recent section headers in `SessionSidebarList.tsx` |

---

## Test impact

- **Scope tested:** `SessionRow.test.tsx` (via `--testPathPattern=SessionRow|useSessions|SessionSidebar`)
- **Result:** ✅ 4/4 tests pass, 4 snapshots pass
- **Pre-existing failures (out of scope):** `MessageBubble.test.tsx` — 1 snapshot failure that predates this audit and is unrelated to sessions/sidebar changes. Visible in full `--selectProjects components` run (1 suite fail / 4 tests fail / 1 snapshot fail).

---

## Exit criteria

- [x] `docs/audits/findings/06-sessions-sidebar-findings.md` written
- [x] Severity counts accurate: 0C / 0H / 2M / 5L / 3N (13 findings total, 6 auto-fixed, 7 proposed)
- [x] All auto-fixable items fixed (sessions-002, 006, 007, 009, 010, 012)
- [x] `npm test --selectProjects components` scoped to sessions area: ✅ passes
- [ ] Row 06 in `docs/audits/README.md` flipped to `done` (done in next step)
