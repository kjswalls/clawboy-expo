# Server Profiles Findings

Date: 2026-05-09
Agent: claude-sonnet-4-5
Status: done

## Summary

The server-profiles area is well-structured: auth tokens are correctly routed to `expo-secure-store`, profile CRUD is owned by a single hook, and the `pickBestServerProfile` pure function is simple and correct. The main security gap is that SPKI cert-pin data (inside `ServerProfile.security`) is persisted to `AsyncStorage` alongside non-sensitive profile metadata instead of being stored in `expo-secure-store`. Secondary concerns include missing i18n in the critical `PinMismatchScreen`, a context value object identity churn, and two files well over the 300-line guideline.

## Severity Counts

- critical: 0
- high: 1
- med: 2
- low: 4
- nit: 3

## Findings

| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| profiles-001 | high | src/hooks/useServerConfig.tsx:253–260 | SPKI cert-pin hashes stored in `AsyncStorage` via `persist()` — should be `expo-secure-store` | Store `security.pinnedSpkiSha256` and `security.firstSeenSpkiSha256` in a separate `SecureStore` key, keyed per profile. Remove them from the AsyncStorage blob. A rooted/backup-accessible AsyncStorage could be tampered with to silently add bogus pins or remove valid ones, bypassing mismatch detection. | proposed |
| profiles-002 | med | src/components/settings/PinMismatchScreen.tsx:109–252 | All user-visible strings are hard-coded English — no `useTranslation` / `t()` usage in this file | Import `useTranslation`, replace every string literal with a `t('pinMismatch.*')` key, and add the keys to `src/i18n/locales/en/common.json`. | proposed |
| profiles-003 | med | src/contexts/ServerProfileSyncContext.tsx:179 | Provider value object constructed inline on every render, causing all consumers to re-render unnecessarily | Wrap the value in `useMemo([remotePointers, isFetchingPointers, refreshRemotePointers])`. | fixed |
| profiles-004 | low | src/components/settings/AddServerSheet.tsx:1–1084 | File is 1084 lines — 3.6× the 300-line guideline | Proposed split: extract `TokenHelpSection` (lines 754–815), `AuthMethodRow`, and the URL helper functions (`parseWsUrl`, `buildWsUrl`, `stripAddressProtocol`) into sibling files under `src/components/settings/`. | proposed |
| profiles-005 | low | src/components/settings/PinnedKeysScreen.tsx:1–699 | File is 699 lines — 2.3× the 300-line guideline | Extract `PinConfirmSheet` (lines 386–581) into its own file `PinConfirmSheet.tsx`. | proposed |
| profiles-006 | low | src/lib/pickBestServerProfile.ts (no test file) | `pickBestServerProfile` pure function has no unit tests; the audit plan explicitly requires all paths covered | Add `src/lib/__tests__/pickBestServerProfile.test.ts` covering: empty list, single profile, multiple with `lastConnectedAt`, multiple without (fall back to `isActive`), and the tie-break edge case. | proposed |
| profiles-007 | low | src/components/settings/AddServerSheet.tsx:78–95 | URL normalization helpers (`parseWsUrl`, `buildWsUrl`, `stripAddressProtocol`) have no unit tests | Extract helpers to `src/utils/gatewayUrl.ts` (or alongside `isTailnetAddress` already there) and add tests covering: protocol stripping, port extraction, default port fallback, and edge cases like missing port. | proposed |
| profiles-008 | nit | src/components/settings/AddServerSheet.tsx:740–742 | Token input inverts standard `secureTextEntry` UX: token is **visible** while focused, masked only when blurred. Exposes credential to shoulder-surfers during entry. | Replace `onFocus`/`onBlur` toggle with a persistent eye-icon toggle button. Keep `secureTextEntry` true by default; let the user opt in to showing the value. | proposed |
| profiles-009 | nit | src/components/settings/AddServerSheet.tsx:735 | Auth token `TextInput` lacks `accessibilityLabel`; screen readers fall back to placeholder text | Add `accessibilityLabel={t('settings.addServer.authTokenLabel')}` (or password equivalent) to the TextInput. | proposed |
| profiles-010 | nit | src/hooks/useServerConfig.tsx:142 | `addProfile` silently drops all `ServerProfile` input fields beyond `name`, `url`, and `isActive`. `kind`, `security`, `lastConnectedAt`, and `needsToken` from `Omit<ServerProfile,'id'>` are discarded when constructing the stored entry. | Either narrow the input type to only the fields actually used, or forward the full spread: `const entry: ServerProfile = { ...profile, id, isActive: true }` then omit `authToken`. Document the dropped fields explicitly if the drop is intentional. | proposed |

## Auto-Fixes Applied

- profiles-003 (med): wrapped `ServerProfileSyncContext.Provider` value in `useMemo` to stabilize the object reference across renders — `src/contexts/ServerProfileSyncContext.tsx` lines 178–182.

## Open Questions for Human

1. **profiles-001 (high):** The SPKI-pin migration requires a data-migration path: on first launch after the fix, existing pins must be read from AsyncStorage, written to SecureStore, and stripped from the AsyncStorage blob. Should migration happen lazily (on first `getAuthTokenForProfile`-equivalent call) or eagerly on app start inside `useServerConfig`'s hydration effect?

2. **profiles-008 (nit):** The current inverted `secureTextEntry` pattern may be intentional UX for long gateway tokens that users paste and want to verify. If keeping it, consider adding a comment explaining the design choice; if changing it, the eye-icon toggle is the standard pattern used by iOS and Android native password fields.

3. **profiles-006 + profiles-007 (low):** URL helpers and `pickBestServerProfile` test addition — confirm whether these tests should be proposed as a patch in this findings doc or opened as a separate issue/PR.

## Test Impact

- `npm test` run after auto-fix applied.
- In-scope test suites: `useServerConfig.utils`, `PinMismatchScreen`, `PinnedKeysScreen`, `ServerProfileSyncContext` — all **28 tests pass**.
- 3 pre-existing failures outside audit scope (`chatCache/validateBlob`, `chat/InternalEventCard`, `chat/MessageBubble`) — snapshot timezone drift, unrelated to this area.
- Full suite result: 14 failed (pre-existing, out-of-scope), 894 passed, 908 total.
