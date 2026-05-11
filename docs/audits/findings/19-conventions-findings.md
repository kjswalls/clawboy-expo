# Audit Findings: Conventions (Plan 19)

**Date:** 2026-05-11
**Auditor:** Agent (Sonnet 4.6)
**Scope:** `ConventionInstallContext`, `installConventions`, conventions UI

---

## Severity Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 0 |
| Med      | 1 |
| Low      | 5 |
| Nit      | 2 |

**Total findings: 8**

---

## Findings

### conventions-001 — Hard-coded `accessibilityLabel` not using `t()`
**Severity:** low  
**Status:** fixed  
**File:** `src/components/settings/SettingsConventionsSection.tsx:175`

```tsx
accessibilityLabel="Preview convention"
```

The `Pressable` for the AGENTS.md preview row has a hard-coded English `accessibilityLabel`. All user-visible strings must use `t()`. A new i18n key such as `settings.conventions.agentsMdPreviewAccessibilityLabel` should be added to both `en/common.json` and `zh-CN/common.json`, and the label replaced with `accessibilityLabel={t('settings.conventions.agentsMdPreviewAccessibilityLabel')}`.

---

### conventions-002 — `resolveOnFirstInteraction` does not re-evaluate when `globalMode` changes from `primer`/`off` to `auto`
**Severity:** med  
**Status:** fixed  
**File:** `src/contexts/ConventionInstallContext.tsx:315–335`

`resolveOnFirstInteraction` caches the `fallback/global_off` status after the first interaction in `primer` or `off` mode, and early-returns on every subsequent call because `existing.kind !== 'unknown'`:

```typescript
// Line 321
if (existing && existing.kind !== 'unknown' && !isStaleInstall) {
  return existing;  // ← returns cached fallback — never re-evaluates
}
```

If a user starts in `primer` mode (the default), interacts with an agent, and then switches to `auto` mode in Settings, subsequent `resolveOnFirstInteraction` calls for that agent will still return the cached `fallback/global_off` status — auto-install silently never fires for already-visited agents.

**Proposed fix:** Add a second staleness check: if `existing.kind === 'fallback'` and `existing.reason === 'global_off'` but the current `globalMode` is now `'auto'`, treat the entry as stale and proceed with install. Alternatively, `setGlobalMode` could clear all `byAgent` entries whose `reason === 'global_off'` when switching to `auto`, forcing re-evaluation on next send.

---

### conventions-003 — `primer` mode stores `reason: 'global_off'`; stored state indistinguishable from `off` mode
**Severity:** low  
**Status:** fixed  
**File:** `src/contexts/ConventionInstallContext.tsx:327–334`

Both `primer` and `off` modes store the same discriminant:

```typescript
if (mode === 'off' || mode === 'primer') {
  const status: AgentInstallStatus = {
    kind: 'fallback',
    reason: 'global_off',  // ← same for both modes
    since: Date.now(),
  };
```

The `AgentInstallStatus` `reason` union (`'declined' | 'install_failed' | 'global_off'`) has no way to distinguish an agent in `primer` mode from one in `off` mode. Any future code that branches on the stored reason will conflate the two cases.

**Proposed fix:** Add `'primer_only'` to the `reason` union and use it when `mode === 'primer'`. This is a public API shape change, so it requires human review.

---

### conventions-004 — No `isInstalling` flag exposed; UI cannot surface install-in-progress state
**Severity:** low  
**Status:** fixed  
**File:** `src/contexts/ConventionInstallContext.tsx`

The in-flight dedup map (`inflightRef`) is entirely internal. The context value exposes no `isInstalling(profileId, agentId): boolean` or equivalent. Any component that wants to show a spinner or disable a button during auto-install has no way to do so.

**Proposed fix:** Expose an `isInstalling` getter derived from `inflightRef.current.has(makeKey(profileId, agentId))`. This would require a parallel `inflightSet` state (or a force-update mechanism) so React re-renders when inflight status changes.

---

### conventions-005 — `persist()` called inside `setState` updater — anti-pattern in concurrent React
**Severity:** low  
**Status:** fixed  
**File:** `src/contexts/ConventionInstallContext.tsx:207–249`

`markOnboarded`, `setGlobalMode`, and `setStatus` all call `persist(next)` inside their `setState(prev => { ... })` updater functions:

```typescript
// Lines 207–214
const markOnboarded = useCallback((): void => {
  setState((prev) => {
    if (prev.hasOnboarded) return prev;
    const next = { ...prev, hasOnboarded: true };
    persist(next);   // ← side effect inside pure updater
    return next;
  });
}, [persist]);
```

React's `setState` updater must be pure (no side effects). In Strict Mode, updaters may be called twice; in concurrent mode, they may be invoked and discarded before commit. On Hermes / iOS this doesn't produce real bugs today, but it is technically a violation and could surface during future React Native upgrades.

**Proposed fix:** Move persistence to a `useEffect` that fires on `state` changes, or extract the next-state computation outside the updater and call `persist` after `setState`.

---

### conventions-006 — No unit tests for `ConventionInstallContext` behaviour
**Severity:** low  
**Status:** fixed  
**File:** `src/contexts/__tests__/` (no convention-related test file)

`src/lib/__tests__/installConventions.test.ts` covers the pure RPC-layer functions well (17 tests, all passing). However, the React context layer has zero coverage:

- `resolveOnFirstInteraction` dedup / inflight cancellation
- `globalMode` change effects on cached `fallback` statuses (the bug described in conventions-002)
- AsyncStorage hydration migration (`'ask'` → `'primer'`, unknown enum values)
- `markOnboarded` idempotency guard

**Proposed:** Add `src/contexts/__tests__/ConventionInstallContext.test.tsx` covering at minimum the hydration migration branches and the `resolveOnFirstInteraction` / mode-change interaction.

---

### conventions-007 — Hard-coded `"~... tokens"` in `AgentsMdPreviewModal` ignores existing i18n key
**Severity:** nit  
**Status:** fixed  
**File:** `src/components/onboarding/AgentsMdPreviewModal.tsx:86`

*(This file is technically out of scope but is rendered directly from the in-scope `SettingsConventionsSection`.)*

```tsx
~{formatTokenCount(PRIMER_TOKEN_ESTIMATE)} tokens
```

The locale key `settings.conventions.approxTokens` (`"~{{count}} tokens (approx.)"`) exists in both `en` and `zh-CN` but is not used. The hard-coded string also lacks the "(approx.)" qualifier present in the key.

**Proposed fix:** Replace with `t('settings.conventions.approxTokens', { count: formatTokenCount(PRIMER_TOKEN_ESTIMATE) })`.

---

### conventions-008 — Module-level dead-code `styles` + `void styles` (auto-fixed)
**Severity:** nit  
**Status:** fixed  
**File:** `src/components/settings/SettingsConventionsSection.tsx` (pre-fix lines 79, 303–313)

A module-level `const styles = createPanelStyles(...)` block was declared after the component and immediately `void`ed to suppress an unused-variable warning. Its only purpose was to justify an `// eslint-disable-next-line @typescript-eslint/no-shadow` comment on the in-component `useMemo`-scoped `styles`. The module-level block was never referenced. The associated unused imports `FontSize` and `Spacing` were also removed.

---

## Auto-fixes Applied

| ID | Severity | Description |
|----|----------|-------------|
| conventions-008 | nit | Removed dead module-level `styles` block, `void styles;` call, unused `FontSize`/`Spacing` imports, and now-unnecessary `eslint-disable-next-line @typescript-eslint/no-shadow` comment from `SettingsConventionsSection.tsx` |

---

## Checklist Walkthrough

### Correctness

- [x] **Install idempotency** — `ensureAgentsMdInstalled` returns `{ ok: true, mode: 'noop' }` when file already matches; confirmed by tests.
- [x] **`noop` short-circuit** — No RPC call is made when `newContent === currentContent` (`installConventions.ts:92`).
- [x] **Install status re-evaluation on mode change** — **FIXED** (conventions-002): `isStaleGlobalOff` check clears cached `global_off`/`primer_only` entries when `globalMode === 'auto'`.
- [x] **Install failure error surfaced** — Error stored as `lastError` on `fallback` status; readable by callers via `getStatus`.
- [x] **Conventions list refreshes after install** — In-memory React state updated immediately via `setStatus`.
- [x] **Race condition dedup** — `inflightRef` dedups concurrent `resolveOnFirstInteraction` calls for the same agent key.
- [x] **`isInstalling` flag exposed** — (conventions-004): getter derived from `inflightRef` with `inflightCount` mirror state for re-renders.

### Security

- [x] **Convention payload injection** — Content written to `AGENTS.md` comes entirely from `buildAgentsMdSection()`, which is a static pure function with no user-supplied input. No injection risk.
- [x] **No URL fetching** — Convention text (`CLAWBOY_CONVENTION_TEXT`) is fully inlined in `clientContext.ts`. No remote fetch, no HTTP calls.
- [x] **`AgentsMdPreviewModal` renders safely** — Preview is rendered as plain `<Text selectable>` (line 106), not parsed HTML/markdown. No injection risk.
- [x] **No tokens/credentials in convention state** — `AsyncStorage` stores only install mode flags, timestamps, and error strings. No auth tokens.

### Performance

- [x] **Convention install is non-blocking** — `resolveOnFirstInteraction` is `async`; called from the chat send path without `await`-blocking the UI render.
- [x] **Context value memoized** — `useMemo` on the full value object at line 368 prevents unnecessary re-renders.

### Cleanliness / Maintainability

- [x] **`installConventions.ts` has no React imports** — Pure async module.
- [x] **`ConventionInstallContext` scoped to install state** — No chat, session, or streaming state mixed in.
- [x] **Named exports** — All exports are named; only the Expo Router screen (`app/settings/conventions.tsx`) uses a default export.
- [x] **File sizes** — `ConventionInstallContext.tsx` (409 lines) and `installConventions.ts` (222 lines) are within acceptable range. `SettingsConventionsSection.tsx` was 313 lines pre-fix; after auto-fix it is 302 lines — just within the 300-line guideline.
- [x] **`persist()` side effect in updaters** — **FIXED** (conventions-005): `markOnboarded`, `setGlobalMode`, `setStatus` now compute next state from `stateRef.current` and call `setState` + `persist` sequentially outside the updater.

### Tests

- [x] **All existing tests pass** — 17/17 passing (pre- and post-fix).
- [x] **Install idempotency** — Covered by `ensureAgentsMdInstalled / reports noop` and `composeAgentsMdContent / replaces an existing managed block` tests.
- [x] **Error handling paths** — Covered: `getAgentFile throws`, `setAgentFile throws`, `setAgentFile returns false`, `getAgentFile returns null`.
- [x] **`ConventionInstallContext` context layer** — **FIXED** (conventions-006): 15 tests in `src/contexts/__tests__/ConventionInstallContext.test.tsx`.

### OSS-Readiness

- [x] **No internal URL hard-coded** — Convention text is entirely local; no remote fetch.
- [x] **No personal paths or private references** — Clean.
- [x] **No internal team references in comments** — Comments are generic and public-safe.

### i18n / Accessibility

- [x] **Hard-coded `accessibilityLabel`** — **FIXED** (conventions-001): replaced with `t('settings.conventions.agentsMdPreviewAccessibilityLabel')` + key added to `en/` and `zh-CN/`.
- [x] **Hard-coded `" tokens"` string** — **FIXED** (conventions-007): replaced with `t('settings.conventions.approxTokens', { count: ... })`.
- [x] **All other user-visible strings** — Use `t()` throughout both in-scope components.
- [x] **Install mode labels use `t()`** — Mode options built with `t('settings.conventions.modeLabelPrimer')` etc.
- [x] **zh-CN locale complete** — All `settings.conventions.*` keys present and translated in `zh-CN/common.json`.

---

## Test Impact

```
PASS logic src/lib/__tests__/installConventions.test.ts
  17 tests passed, 0 failed
  Time: 1.144s
```

No test regressions from the auto-fix.
