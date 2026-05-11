# Account & Supabase Findings

Date: 2026-05-09
Agent: claude-sonnet-4-6
Status: done

## Summary

The account and Supabase layer is architecturally sound: the `secureStorage` adapter correctly keeps all session tokens in `expo-secure-store`, the Supabase client is a proper singleton, and the `serverPointers` sync is fully idempotent. One high-severity security gap exists — Apple Sign-In does not generate or validate a nonce, leaving identity tokens theoretically replayable. Several medium items follow: the `AccountContextValue` object is recreated on every render (missing `useMemo`), and `SignInSheet` bypasses the app's i18n system with hard-coded English strings while every other account-related screen uses `t()`. No service-role key was found anywhere in source.

## Severity Counts

- critical: 0
- high: 1
- med: 2
- low: 4
- nit: 2

## Findings

| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| account-001 | high | src/lib/supabase/auth.ts:26 | Apple Sign-In does not generate or pass a nonce — identity token replay possible | Generate a cryptographically random nonce, SHA-256-hash it, pass the hash to `AppleAuthentication.signInAsync({ nonce: hashedNonce })`, and pass the raw nonce to `supabase.auth.signInWithIdToken({ nonce: rawNonce })`. Use `expo-crypto` `digestStringAsync`. | proposed |
| account-002 | med | src/contexts/AccountContext.tsx:127 | `AccountContextValue` object is rebuilt on every render — all `useAccount()` consumers re-render on any state change | Wrap the value object in `useMemo` (all five state values as deps, all five callbacks are already stable via `useCallback`). Add `useMemo` import. | proposed |
| account-003 | med | src/components/settings/SignInSheet.tsx:160,242,281,330,347 | All user-visible strings in `SignInSheet` are hard-coded English — no `t()` calls while `AccountSettingsScreen` and `AccountSection` both use `react-i18next` | Add `useTranslation()` to the sheet and sub-screens; extract strings to `src/i18n/locales/en/common.json` under `settings.account.signIn.*` keys. Changing key names is a proposed fix per `_RULES.md`. | proposed |
| account-004 | low | src/components/settings/AccountCard.tsx:1 | `AccountCard` is dead code — no import exists anywhere in the codebase; the component shows hard-coded fake identity ("ClawBoy User", "user@clawboy.app", "Free plan") | Delete `src/components/settings/AccountCard.tsx`; real identity display lives in `AccountSection.tsx` (which is wired to `useAccount()`). | fixed |
| account-005 | low | src/lib/supabase/auth.ts:132 | `deleteAccount()` calls `supabase.auth.signOut()` directly without checking the returned `error` — if sign-out fails the local SecureStore tokens are not cleaned up; the calling site would receive success even with stale tokens | Either propagate the sign-out error (recommended), or call the exported `signOut()` helper which already checks `error`. | proposed |
| account-006 | low | src/components/settings/AccountSettingsScreen.tsx:1, src/components/settings/SignInSheet.tsx:1 | Both files exceed the 300-line guideline: `AccountSettingsScreen.tsx` is 484 lines, `SignInSheet.tsx` is 559 lines — split candidates per `.cursorrules` | Extract `AchievementsCard` to its own file from `AccountSettingsScreen`, and extract `ChooseScreen`, `EmailScreen`, `SentScreen`, `GoogleSignInButton`, `AuthButton` sub-components from `SignInSheet`. Do not split automatically — propose only. | proposed |
| account-007 | low | src/lib/supabase | No unit tests for `AccountContext` auth state machine — mount/sign-in/sign-out/token-refresh lifecycle is untested; `serverPointers.ts` has good coverage (11 tests) | Add `AccountContext.test.tsx` covering: initial `unknown` → `signed-out` transition on null session; `unknown` → `signed-in` + `fetchProfile` on existing session; `onAuthStateChange` clears state on sign-out; `handleSignOut` / `handleDeleteAccount` delegate to auth helpers. Propose only per `_RULES.md`. | proposed |
| account-008 | nit | src/lib/supabase/secureStorage.ts:76 | `removeItem` reads the stored value synchronously (to detect chunked data) then fires `deleteItemAsync` without awaiting — if the process terminates immediately after removing the base key but before chunk keys are deleted, orphaned chunk data remains in the keychain | Return a `Promise<void>` from `removeItem` and `await` all `deleteItemAsync` calls; `SupportedStorage` accepts async returns. | proposed |
| account-009 | nit | src/lib/supabase/auth.ts:63 | `signInWithGoogle()` does not validate that `result.url` starts with the expected `clawboy://auth-callback` prefix before parsing tokens from the fragment — OS-level (`ASWebAuthenticationSession`) protection mitigates practical risk but a belt-and-suspenders check is cheap | Add `if (!result.url.startsWith('clawboy://auth-callback')) throw new Error(...)` before the fragment-parsing block. | proposed |

## Auto-Fixes Applied

- account-004 (low): deleted dead file `src/components/settings/AccountCard.tsx` — the component was never imported anywhere in the codebase and displayed hard-coded placeholder identity data ("ClawBoy User", "user@clawboy.app", "Free plan"); real identity display lives in `AccountSection.tsx` which is fully wired to `useAccount()`.

## Open Questions for Human

- **account-001 nonce generation**: `expo-crypto` provides `digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce)`. If `expo-crypto` is not already in the dependency tree, adding it is a new dependency (requires human sign-off per `_RULES.md`). Confirm availability before applying the fix.
- **account-003 i18n key placement**: The `SignInSheet` strings overlap thematically with `settings.account.signIn.*` keys already used in `AccountSection` and `AccountSettingsScreen`. Confirm whether to reuse those keys or introduce new ones (e.g., `settings.account.signInSheet.*`).
- **account-005 deleteAccount signOut error**: If the Edge Function succeeds but the local `signOut` fails, `onAuthStateChange` will eventually fire with a 401 response from Supabase and clear state automatically. Decide whether to propagate the error (stricter) or swallow it (more lenient UX — the account is already gone server-side).

## Test Impact

- `npm test` (scoped to account/supabase): 11/11 passing (`src/lib/__tests__/serverPointers.test.ts`)
- `npm test` (full suite): 894/908 tests passing; 14 pre-existing failures in `src/lib/chatCache/__tests__/validateBlob.test.ts`, `src/components/chat/__tests__/InternalEventCard.test.tsx`, and `src/components/chat/__tests__/MessageBubble.test.tsx` (stale snapshots in the chat area — outside this audit's scope)
- Auto-fix account-004 (deleted `AccountCard.tsx`): no test suite referenced this file; confirmed no regression
