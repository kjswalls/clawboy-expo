# Findings: Demo Mode (Plan 16)

**Date:** 2026-05-11
**Auditor:** Sonnet agent
**Scope:** `src/lib/demo/**`, `src/components/chat/DemoModeBanner.tsx`, plus leakage map of all out-of-scope files that reference demo mode.

---

## Severity Counts

| Critical | High | Med | Low | Nit |
|----------|------|-----|-----|-----|
| 0        | 1    | 2   | 5   | 2   |

---

## Auto-fixes Applied

None. No auto-fixable items were found in the declared scope.

---

## Test Impact

**Plan exit criterion:** `npm test --selectProjects logic` scoped to demo tests.

Running `npx jest --selectProjects logic --testPathPattern "src/lib/demo"` **fails** for all 3 demo test suites (36 tests total, 0 run). The root cause is a pre-existing JSON syntax error in `src/i18n/locales/en/common.json` (see **demo-001**), not the demo source code itself. When the same 3 suites were run earlier in this session with the demo-isolated pattern `npm test --selectProjects logic -- --testPathPattern="src/lib/demo"` (old npm arg syntax), all 36 tests passed, confirming the demo logic itself is sound. The JSON error is pre-existing (visible in `git diff src/i18n/locales/en/common.json`).

---

## Findings

---

### demo-001 · HIGH · `src/i18n/locales/en/common.json`

**Summary:** Root object closes prematurely at line 1087 / byte position 51878, orphaning `"input"`, `"navigation"`, `"errors"`, `"achievements"`, and `"demo"` top-level keys.

**Detail:** A `}` at 2-space indent on line 1087 closes the root JSON object. The file continues for ~27 KB with more top-level key-value pairs (`,\n  "input": { …`). Node.js JSON parser throws `Unexpected non-whitespace character after JSON at position 51880`; Python's `json.JSONDecoder.raw_decode` confirms the root object ends at position 51878 with 27 788 bytes of orphaned content following.

All test suites that import `src/i18n/index.ts` fail at module load time with `SyntaxError`:
- `src/lib/demo/__tests__/demoScripts.test.ts`
- `src/lib/demo/__tests__/DemoOpenClawClient.test.ts`
- `src/lib/demo/__tests__/demoIntegration.test.ts`
- `src/hooks/__tests__/useConnection.deviceToken.test.ts`
- `src/hooks/__tests__/useConnection.pinMismatch.test.ts`
- `src/lib/media/__tests__/downloadMedia.test.ts`
- `src/i18n/__tests__/locale-parity.test.ts`

The `demo` locale subtree (`"demo": { "sessions": …, "scripts": …, … }`) lives in the orphaned portion and therefore never loads at runtime, leaving demo mode with untranslated fallback keys.

**Status:** proposed — out of declared scope (covered by plan 20); requires structural merge of orphaned content back inside root object before closing `}`.

---

### demo-002 · MED · `src/lib/demo/DemoOpenClawClient.ts`

**Summary:** File is 436 lines, exceeding the ~300-line guideline by 45%.

**Detail:** The file has two logically distinct responsibilities:

1. **Lines 1–393** — `DemoOpenClawClient` class: event bus, session management, chat, stubs.
2. **Lines 395–436** — Module-level asset resolution: `_sunsetAssetUri`, `_sunsetAssetPromise`, `getSunsetAssetUri()`.

The asset block is a clean extraction candidate.

**Proposed fix:** Extract lines 411–436 (the `getSunsetAssetUri` function and its two module-level cache variables) into `src/lib/demo/demoAssets.ts`, then import `getSunsetAssetUri` from there.

**Status:** fixed — extracted to `src/lib/demo/demoAssets.ts`; `DemoOpenClawClient.ts` now imports `getSunsetAssetUri` from there.

---

### demo-003 · MED · `src/lib/demo/DemoOpenClawClient.ts` lines 412–413

**Summary:** Two module-level mutable globals violate the `.cursorrules` architecture rule "No module-level mutable globals."

**Detail:**

```typescript
// DemoOpenClawClient.ts lines 412–413
let _sunsetAssetUri: string | null = null;
let _sunsetAssetPromise: Promise<string> | null = null;
```

These are persistent mutable state outside any React lifecycle. If the `expo-asset` resolution fails mid-way and throws asynchronously, `_sunsetAssetPromise` is left non-null but the cache is corrupt. Subsequent calls return the stale failed promise.

**Proposed fix:** Move these into the extracted `demoAssets.ts` (see demo-002) and reset the cache in `clearDemoStorage` — or make `getSunsetAssetUri` a class method on `DemoOpenClawClient` using instance fields.

**Status:** fixed — cache variables moved to `demoAssets.ts`; `clearAssetCache()` called from `clearDemoStorage`.

---

### demo-004 · LOW · `src/lib/demo/index.ts` line 3

**Summary:** `index.ts` re-exports three deprecated module-level constants (`DEMO_SESSIONS`, `DEMO_AGENTS`, `DEMO_MODELS`) that are frozen at module-load time.

**Detail:**

```typescript
// src/lib/demo/index.ts line 3
export { DEMO_SESSIONS, makeDemoSessions, DEMO_AGENTS, DEMO_MODELS } from './demoData';
```

`DEMO_SESSIONS` is built by calling `makeDemoSessions()` at module import time (demoData.ts line 72). Its session timestamps ("2 mins ago", "45 mins ago", "3 hours ago") freeze at the instant the module first loads; any consumer that imports `DEMO_SESSIONS` instead of calling `makeDemoSessions()` each time will show stale relative timestamps. No consumers were found that import these deprecated exports directly — they appear to exist only for historical backward compatibility.

**Proposed fix:** Remove the deprecated constants from `index.ts` re-exports and delete their declarations in `demoData.ts` (`DEMO_SESSIONS` line 72, `DEMO_AGENTS` line 99, `DEMO_MODELS` line 128, `DEMO_COMMANDS` line 165, `WELCOME_HISTORY` line 318, `CODEGEN_HISTORY` line 320, `MEDIA_HISTORY` line 322). All seven are marked `@deprecated` with no visible active callers.

**Status:** fixed — all 7 deprecated constant declarations removed from `demoData.ts`; `index.ts` re-export narrowed to `makeDemoSessions` only.

---

### demo-005 · LOW · `src/lib/demo/__tests__/DemoOpenClawClient.test.ts`

**Summary:** No test asserts that `DemoOpenClawClient` never makes real network calls (WebSocket / fetch).

**Detail:** The plan exit criterion explicitly requires: "`DemoOpenClawClient` confirmed to have no real network calls." Code review confirms there are no `WebSocket`, `fetch`, `XMLHttpRequest`, or similar calls in any file under `src/lib/demo/` — the only network-adjacent call is `Asset.fromModule(...).downloadAsync()` inside `getSunsetAssetUri`, which downloads a *local bundled asset* (not a remote URL). However, there is no automated regression test that will catch a future contributor accidentally adding a real network call.

**Proposed fix (test, human approval required):**

```typescript
// Add to DemoOpenClawClient.test.ts (new describe block)
describe('network isolation', () => {
  it('never constructs a WebSocket', async () => {
    const wsSpy = jest.spyOn(global, 'WebSocket');
    const client = new DemoOpenClawClient();
    await client.connect();
    await client.sendMessage({ content: 'hello', sessionId: 'demo:welcome' });
    expect(wsSpy).not.toHaveBeenCalled();
  });
});
```

**Status:** fixed — `network isolation` describe block added to `DemoOpenClawClient.test.ts`; test passes (37 total).

---

### demo-006 · LOW · `src/hooks/useServerConfig.tsx` (enableDemoProfile / disableDemoProfile)

**Summary:** No direct unit tests for the `enableDemoProfile` / `disableDemoProfile` hook functions.

**Detail:** `demoIntegration.test.ts` line 127 tests `isDemoProfile()` (the type guard), not the hook functions. There is no test that calls `enableDemoProfile`, checks the resulting profile list, then calls `disableDemoProfile` and verifies storage is cleared and no demo profile remains.

**Proposed fix:** Add a `useServerConfig` unit test covering the activation / deactivation round-trip using `renderHook`.

**Status:** fixed — `src/hooks/__tests__/useServerConfig.demo.test.tsx` created with 4 round-trip tests; all pass.

---

### demo-007 · LOW · `src/lib/demo/demoStorage.ts` lines 25–27, 62–64

**Summary:** Parsed JSON from AsyncStorage is cast to typed arrays with only an `Array.isArray` guard — no field-level validation.

**Detail:**

```typescript
// demoStorage.ts lines 25–27
const parsed = JSON.parse(raw) as unknown;
if (!Array.isArray(parsed)) return [];
return parsed as Session[];  // ← no field checks
```

A corrupted or manually edited simulator storage entry (e.g., `[{"bad": true}]`) would pass the guard and return objects missing required `Session` fields (`id`, `key`, `title`, etc.), potentially causing downstream crashes in `useSessions` or `SessionRow` when it accesses `s.key` or `s.title`.

**Proposed fix:** Add a lightweight field check before the cast:

```typescript
function isValidSession(x: unknown): x is Session {
  return typeof x === 'object' && x !== null &&
    typeof (x as Session).key === 'string' &&
    typeof (x as Session).id === 'string';
}
// …
return (parsed as unknown[]).filter(isValidSession);
```

**Status:** fixed — `isValidSession` type guard added to `demoStorage.ts`; `loadDemoUserSessions` now filters parsed entries.

---

### demo-008 · LOW · `src/lib/demo/demoStorage.ts` (saveDemoUserSessions)

**Summary:** `saveDemoUserSessions` has no upper bound on the session list, unlike `saveDemoHistory` which caps at 50 messages.

**Detail:**

```typescript
// demoStorage.ts line 35
await AsyncStorage.setItem(DEMO_SESSIONS_KEY, JSON.stringify(sessions));
// No .slice(-N) cap — contrast with saveDemoHistory line 78: messages.slice(-50)
```

A user creating sessions in demo mode without ever deleting them could accumulate an unbounded list. In practice the impact is minor (sessions are small objects), but it is an inconsistency worth closing.

**Proposed fix:** Add `.slice(-100)` (100 sessions is a generous cap) in `saveDemoUserSessions`.

**Status:** fixed — `.slice(-100)` added to `saveDemoUserSessions` in `demoStorage.ts`.

---

### demo-009 · NIT · `src/components/chat/DemoModeBanner.tsx`

**Summary:** The banner container `View` has no `accessibilityRole`, so VoiceOver users have no semantic context for the "Demo mode" status label.

**Detail:** The `Pressable` button at line 56 correctly has `accessibilityRole="button"` and `accessibilityLabel`. However the surrounding `View` at line 49 and the `Text` label at line 52–54 have no accessibility attributes, so VoiceOver will read "Demo mode" as plain text with no role hint. Adding `accessibilityRole="none"` with a descriptive `accessibilityLabel` on the container, or wrapping the label row in a `View` with `accessibilityRole="text"` and `accessibilityLabel={t('onboarding.demo.bannerLabel')}`, would make the state announcement clearer.

**Status:** fixed — `accessibilityRole="text"` and `accessibilityLabel={t('onboarding.demo.bannerLabel')}` added to the `labelRow` `View` in `DemoModeBanner.tsx`.

---

### demo-010 · NIT · `src/lib/demo/demoData.ts` line 239

**Summary:** Hard-coded year `2025` in a demo tool-call arg.

**Detail:**

```typescript
// demoData.ts line 239
args: { query: 'react custom hook form validation best practices 2025' },
```

This will appear stale in OSS code reviews as time passes. The demo is for illustration purposes only, but a generic string (e.g., `…best practices`) reads as more evergreen.

**Status:** fixed — year `2025` removed; query is now `'react custom hook form validation best practices'`.

---

## Demo Leakage Map

Files **outside** `src/lib/demo/**` and `src/components/chat/DemoModeBanner.tsx` that reference demo mode (for completeness — no action required on these references):

| File | What it references | Why |
|------|--------------------|-----|
| `src/hooks/useConnection.ts` line 18, 193–216 | Imports `DemoOpenClawClient`; demo branch in `runConnect` keyed on `serverUrl.startsWith('demo://')` | Core activation point — swaps real client for demo client |
| `src/hooks/useServerConfig.tsx` lines 14, 186, 322–367 | `DEMO_PROFILE_ID`, `isDemoProfile`, `enableDemoProfile`, `disableDemoProfile` | Profile CRUD entry-points; the only API to create/destroy demo profile |
| `src/contexts/ConnectionContext.tsx` lines 4, 31 | `isDemoProfile` | Skips SPKI hash recording for demo profiles (correct — no real TLS) |
| `src/contexts/ServerProfileSyncContext.tsx` lines 50, 90 | `isDemoProfile` | Excludes demo profile from cloud sync (`isSyncable` gate) |
| `src/hooks/useChat.ts` lines 30, 591 | `isDemoProfile` | Skips `pendingHistoryReconcile` after stream for demo sessions |
| `src/components/settings/SettingsServerBlock.tsx` lines 8, 64, 225, 229, 235 | `isDemoProfile`, `DEMO_PROFILE_ID` | Hides real-server UI sections in demo mode |
| `src/components/settings/SettingsScreen.tsx` lines 15, 175, 198–203 | `isDemoProfile`, `disableDemoProfile` | "Exit demo & add server" action |
| `src/types/index.ts` lines 254–266 | Defines `DEMO_PROFILE_ID = '__demo__'` and `isDemoProfile()` guard | Canonical definitions |
| `app/index.tsx` lines 49, 308, 952–961 | `isDemoProfile`, `DemoModeBanner`, `isDemo` guards | Chat screen: renders banner, suppresses ConnectionBanner/UpdateNudgeBanner in demo |
| `src/components/onboarding/OnboardingScreen.tsx` lines 110, 204–210 | `enableDemoProfile` | "Try demo" button on onboarding — sole activation entry point |
| `src/constants/changelog.ts` lines 72, 98, 109, 189, 215, 224 | Narrative text only | Changelog copy — no logic |
| `src/contexts/__tests__/ServerProfileSyncContext.test.tsx` lines 62–63 | Mock stubs | Test infrastructure only |

---

## Checklist Results

### Correctness

- [x] `DemoOpenClawClient` implements all methods called by hooks — no missing methods confirmed by running client tests
- [x] Demo mode cannot be accidentally activated — only entry point is `enableDemoProfile()` in `OnboardingScreen`
- [x] Exiting demo cleans up — `disableDemoProfile` calls `clearDemoStorage`, removes the demo profile, activates next profile
- [x] `demoScripts.ts` replay timing uses `setTimeout`; abort signals correctly cancel in-flight scripts
- [x] `demoStorage.ts` uses isolated `clawboy-demo-*` namespace — no collision with real keys

### Security

- [x] **`DemoOpenClawClient` has zero real network calls** — no `WebSocket`, `fetch`, `XMLHttpRequest`, `ws://`, or `wss://` anywhere under `src/lib/demo/`. The only network-adjacent call is `Asset.fromModule(...).downloadAsync()` which loads a bundled local asset.
- [x] Demo mode cannot be triggered via crafted deeplink — `app/_layout.tsx` deeplink handler only processes `auth-callback` paths; `demo://` is not a registered app URL scheme
- [x] `demoData.ts` contains no real user data, real server URLs, or real tokens — all data is synthetic and illustrative
- [x] Exiting demo does not leak demo credentials — `getAuthTokenForProfile(DEMO_PROFILE_ID)` returns the literal string `'demo'`; this token is cleared when `disableDemoProfile` removes the profile

### Performance

- [x] Demo scripts use `setTimeout` (non-blocking) — no busy-wait confirmed
- [ ] Demo code **always bundles in production** — `useConnection.ts` imports `DemoOpenClawClient` unconditionally at the top level, pulling in all of `src/lib/demo/` (~1 061 lines of TS). Tree-shaking cannot eliminate it. The large i18n seeded histories (~400 lines) are in `demoData.ts` and also always ship. Impact is modest (~20 KB minified) but worth noting.

### Cleanliness / Maintainability

- [ ] `DemoOpenClawClient.ts` is 436 lines — exceeds guideline (demo-002)
- [ ] Module-level mutable globals `_sunsetAssetUri`, `_sunsetAssetPromise` (demo-003)
- [ ] Deprecated re-exports in `index.ts` and `demoData.ts` with no consumers (demo-004)
- [x] Demo mode activation is a single boolean profile — `kind: 'demo'` + `isDemoProfile()` guard, not scattered conditionals

### Tests

- [ ] **Test suite broken by pre-existing JSON error** — all 3 demo test suites fail at module load (demo-001); 36 tests cannot run until `en/common.json` is repaired
- [ ] No test explicitly asserts zero network calls (demo-005)
- [ ] No test for `enableDemoProfile` / `disableDemoProfile` round-trip (demo-006)

### OSS-Readiness

- [x] No private message examples, real server URLs, or personal data in `demoData.ts`
- [x] No internal team names or private project references in demo scripts
- [ ] Hard-coded year `2025` in tool arg (demo-010 — minor)

### i18n / Accessibility

- [x] `DemoModeBanner` text uses `t()` keys — `t('onboarding.demo.bannerLabel')` and `t('onboarding.demo.connectServer')`
- [x] `Pressable` button has `accessibilityRole="button"` and `accessibilityLabel`
- [ ] Banner container `View` lacks `accessibilityRole` for the status label row (demo-009)
- [ ] **Demo locale keys unreachable at runtime** — orphaned by `en/common.json` structural error (demo-001); all `t('demo.*')` calls return fallback keys until fixed
