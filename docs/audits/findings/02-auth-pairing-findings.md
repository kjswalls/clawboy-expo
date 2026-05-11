# Auth & Device Pairing Findings

Date: 2026-05-09
Agent: claude-opus-4
Status: done

## Summary

Overall this surface is in solid shape and clearly engineered for ClawBoy's
"root-of-trust" role. The Ed25519 keypair lives only in `expo-secure-store`,
the private seed never leaves `device-identity.ts`, all challenge signing is
async, and the `ConnectionState` union is more exhaustive than the spec
(adds `identity_rejected` and `pin_mismatch` on top of the documented five).
The `_connectGeneration` discipline plus the `canTransitionTo` guard cleanly
protect sticky terminal states (`pin_mismatch`, `identity_rejected`,
`pairing_required`) from being silently overwritten by background reconnect /
TLS error events, and AppState + `expo-network` handling are both wired in.

The most material gap is that the gateway's per-device `deviceToken` (returned
in `hello-ok.auth`) is never persisted: `saveDeviceToken` /
`getDeviceToken` / `clearDeviceToken` are implemented and exported in
`device-identity.ts` but no caller ever invokes them. Beyond that, the
remaining findings are mid-level perf / i18n / OSS-readiness concerns and
test-coverage gaps.

## Severity Counts

- critical: 0
- high: 1
- med: 3
- low: 6
- nit: 2

## Findings

| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| auth-001 | high | src/lib/device-identity.ts:212-222 | `saveDeviceToken`, `getDeviceToken`, `clearDeviceToken` are exported but never called anywhere in the codebase. The `deviceToken` returned in `hello-ok.auth` (per `.cursorrules` §WebSocket Protocol) is therefore never persisted, defeating the design intent for "future reconnect without re-pairing". The challenge-response cost is paid on every cold start. | After human review of the gateway contract: extract `payload.auth.deviceToken` (or equivalent) in the `hello-ok` handler in `src/lib/openclaw/client.ts` (plan 01) and call `saveDeviceToken(host, token, role)` from `useConnection.ts`. Use the persisted token (if present) as the auth credential on next connect, falling back to the user-entered token when absent. Wire `clearDeviceToken` into the disconnect/forget-server path. | proposed |
| auth-002 | med | src/hooks/useConnection.ts:647-658 | `useConnectionController()` returns a fresh object literal on every render. That object is then placed directly into `<ConnectionContext.Provider value={value}>` (`src/contexts/ConnectionContext.tsx:47`), so any time the provider re-renders for an unrelated reason every `useConnection()` consumer re-renders too. With chat lists / message bubbles / sidebar all subscribed, this is meaningful churn. | Wrap the return value in `useMemo` keyed on `connectionState`, `connectGeneration`, `gatewayToken`, `gatewayUrl` (functions are already stable via `useCallback`, `clientRef`/`spki` setter are stable refs). Treat as proposed because `ConnectionContext.tsx` is in the `_RULES.md` "auth state machine transitions" sensitive list — even a pure perf change should land under human review. | proposed |
| auth-003 | med | src/hooks/useConnection.ts:233-238, 305-309, 320-324, 333-337, 622-625 | `ConnectionState`'s `message` and the synthetic strings inside it ("Could not create or load device identity.", "Could not reconnect after multiple attempts.", "TLS certificate validation failed for this server.", "No internet connection.") are hard-coded English. They flow into UI components (e.g. error cards) where `t()` is then applied to the surrounding chrome, so the body line ships untranslated. Plan checklist explicitly requires "Auth error messages shown to user use `t()` keys". | Add stable error-code identifiers to `ConnectionState` (e.g. extend the existing `error: 'auth_failed' \| 'cert_error' \| 'timeout' \| 'network'` and an opt-in `code` discriminator for the device-identity / reconnect-exhausted variants). Have the UI render via `t()` keyed on the code. Carry the raw gateway message only as a debug-only field. Proposed because it touches the public shape of `ConnectionState`. | proposed |
| auth-004 | med | src/hooks/useConnection.ts:151-152, 396-401 | `lastTickAtMsRef` is written on every server `tick` event but is never read anywhere in the file (or in any consumer per `rg lastTickAtMsRef` — only the two lines above match). Either it is dead state, or it was intended to be exposed to a health-watcher hook that was never finished. | Decide intent: (a) drop the ref + the `tick` listener, or (b) surface `lastTickAtMs` on `ConnectionControllerValue` so a "stale connection" indicator can use it. Option (a) is the cleaner default. Listed as proposed because the listener is wired into `OpenClawClient`'s tick stream — removing it should be reviewed alongside plan 01's tick-watch logic. | proposed |
| auth-005 | low | src/hooks/useConnection.ts:149, 375 | `connectRef` is typed as `useRef<(serverUrl: string, authToken: string) => void>` but the actual `connect` function takes a third `profileSecurity?: ProfileSecurity` argument and the watchdog call site invokes it with three. TypeScript accepts the extra arg but the type lies. | Tighten the ref type to `(serverUrl: string, authToken: string, profileSecurity?: ProfileSecurity) => void`. | proposed |
| auth-006 | low | src/hooks/useAutoReconnect.ts:52-53 | The demo-profile auth token is a hard-coded string literal `'demo'`. The same sentinel exists implicitly elsewhere in the demo path (`src/lib/demo`). | Promote to a named constant alongside `DEMO_PROFILE_ID` in `src/types/index.ts` (e.g. `DEMO_AUTH_TOKEN`) and import it from both call sites. Cosmetic but improves search-ability. | proposed |
| auth-007 | low | src/lib/device-identity.ts:212-222 (sanitization) | `sanitizeKeySegment` replaces non-`[a-zA-Z0-9._-]` characters with `_`. Two distinct hosts that differ only in disallowed characters (e.g. `a:b.example` vs `a_b.example`) collide on the same SecureStore key. Today's only caller is the (unused) device-token API so the impact is theoretical, but if auth-001 is fixed this becomes a real cross-host token leak risk. | Use a stable hash of the host (e.g. SHA-256 prefix) instead of a character-replace. Apply only after auth-001 is approved, since that is what makes this real. Proposed — `device-identity.ts` is in the absolutely-forbidden list per `_RULES.md` + this audit's own constraint. | proposed |
| auth-008 | low | src/hooks/useConnection.ts:183, 416, 420, 428, 490, 516, 539, 566, 579 | `debugIngest(...)` calls carry hard-coded debug-session identifiers (`runId: 'post-fix-reconnect'`, `runId: 'post-fix-bg2'`, `hypothesisId: 'H_RECONNECT'`, `H1`, `H2`) that look like leftover instrumentation from a specific debugging session. They are gated behind `__DEV__ && EXPO_PUBLIC_DEBUG_INGEST=1` so they ship as no-ops, but the literals leak internal hypothesis tags into OSS source. | Either remove the calls or strip the `runId`/`hypothesisId` values to neutral names before open-sourcing. Listed as proposed (not auto-fixed) because the connection-recovery code is sensitive enough that even noise reduction belongs under human review. | proposed |
| auth-009 | low | src/hooks/__tests__/useConnection.pinMismatch.test.ts | Only the `pin_mismatch` branch of the connection state machine has a hook test. There is no coverage for: `auth_failed` mapping (`mapConnectError` 401/403/invalid_token branch), `cert_error`, `timeout`, `pairing_required` from `NOT_PAIRED`, `identity_rejected`, the watchdog-triggered reconnect path, or the `canTransitionTo` guards. | Add `useConnection.errorPaths.test.ts` with renderHook tests that drive `mapConnectError` outcomes and the sticky-state guard. Proposed — adding a new test suite is "Test additions beyond trivial snapshot refreshes" per `_RULES.md`. | proposed |
| auth-010 | low | app/auth-callback.tsx | This file is purely a redirect shim — the actual deep-link parsing of `clawboy://auth-callback#access_token=…` happens in `app/_layout.tsx` (out of scope for this plan). There is **no** unit test on either side validating that (a) the URL host/path check rejects a spoofed `clawboy://attacker-callback` link, (b) malformed `access_token` / `refresh_token` fragments are dropped, (c) the `?code=` PKCE branch handles errors. The plan checklist explicitly requires "Auth-callback URL validation has a unit test". | Propose adding a unit test on the deep-link extraction logic. The logic itself lives in `app/_layout.tsx` so the new test belongs to a future cross-cutting effort or a refactor that lifts the parser into `src/lib/`. Proposed — both the test addition and the refactor are out of scope for this audit. | proposed |
| auth-011 | nit | app/auth-callback.tsx:42 | The local `const t = setTimeout(...)` shadowed the `t` imported from `useTranslation()` two lines above (`const { t } = useTranslation();` at line 27). Renaming the timer local to `timer` removes the shadow and is clearer. | Rename `t` → `timer`. | fixed |
| auth-012 | nit | src/lib/device-identity.ts:53-71 | `secureGet` and `secureRemove` swallow `SecureStore` errors silently (`try { ... } catch { return null; }`, `try { ... } catch { /* ignore */ }`). For `getItemAsync` this masks Keychain unlock failures (e.g. on a freshly-restored device); for `deleteItemAsync` it is benign. The current `getOrCreateDeviceIdentity` partially mitigates this by retrying on the synthesised "stored is null" path, but a transient unlock failure on a device with a stored identity quietly causes the identity to be regenerated, which then triggers an unnecessary `pairing_required` cycle. | Re-throw read errors and let `getOrCreateDeviceIdentity` decide between regenerate vs. surface-error explicitly; or at minimum log via the existing `__DEV__` warn path. Proposed — `device-identity.ts` is forbidden to auto-fix per this plan and `_RULES.md`. | proposed |

## Auto-Fixes Applied

- **auth-011 (nit)** — renamed the local `setTimeout` reference in
  `app/auth-callback.tsx` from `t` to `timer` so it no longer shadows the
  `t` translator imported from `useTranslation()`. Behaviour is identical;
  this is a pure readability / lint hygiene fix per `_RULES.md` "Fixing
  typos in comments, string literals, and identifier names".

No other in-scope file was modified. In particular **zero changes were
made to `src/lib/device-identity.ts`**, in line with this plan's exit
criteria and the `_RULES.md` absolutely-forbidden list.

## Open Questions for Human

1. **`deviceToken` lifecycle (auth-001).** The function trio is in place but
   never called. Was the gateway-side delivery of `payload.auth.deviceToken`
   in `hello-ok` finished, and if so should `useConnection.ts` (or
   `OpenClawClient.handleMessage`'s `hello-ok` branch in plan 01) read and
   persist it? The right plan ownership is ambiguous because the consumer
   (storage helpers) is in plan 02 but the producer (hello-ok parsing) is
   in plan 01. Cross-plan coordination required.
2. **`identity_rejected` recovery flow (auth-001 follow-on).** Today
   `onDeviceIdentityStale` sets the sticky `identity_rejected` state but
   there is no UI-side workflow visible from this scope to call
   `clearDeviceIdentity()` + reconnect. The `IdentityRejectedCard` exists
   (out of scope) — confirm that workflow is wired before release.
3. **Token-key collision risk (auth-007).** If auth-001 is approved, the
   sanitisation of host in `deviceTokenKey` should be revisited at the same
   time so collisions cannot exfiltrate one server's `deviceToken` to
   another. Two changes, one PR, single review.
4. **`debugIngest` call sites (auth-008).** Should these be removed entirely
   for OSS, kept gated as today, or rewritten to neutral identifiers?
   Recommend removing the `runId` / `hypothesisId` literals at minimum.
5. **`ConnectionState.message` i18n (auth-003).** Does the team prefer
   adding a discriminated `code` field, or keeping the current pattern
   (gateway/system message string + UI translates surrounding chrome only)?

## Test Impact

- Ran `npm test --selectProjects logic` after the auth-011 auto-fix.
- **Result:** 42 of 43 suites pass, 779 of 784 tests pass.
- The 5 failing tests are all in
  `src/lib/chatCache/__tests__/validateBlob.test.ts` (chat-cache versioning
  expectations) — **out of scope for this audit (plan 04)** and unrelated
  to any change made in this run. The two in-scope test suites
  (`src/lib/__tests__/device-identity.test.ts` —
  9 cases; `src/hooks/__tests__/useConnection.pinMismatch.test.ts` —
  2 cases) all pass.
- No new tests were added — all gaps are recorded as proposed in
  auth-009 / auth-010 per `_RULES.md` rule against unsolicited test-suite
  additions.
