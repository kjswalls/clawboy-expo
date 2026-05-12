# X5 — Test Coverage Findings

**Audit plan:** `docs/audits/X5-test-coverage.md`
**Date:** 2026-05-12
**Agent:** automated audit pass

---

## 1. Test Run Summary

Command: `npm test -- --coverage --coverageReporters json-summary --forceExit`

| Metric | Result |
|---|---|
| Test suites | 83 passed, 0 failed |
| Tests | 1191 passed, 0 failed |
| Snapshots | 70 passed, 0 obsolete, 0 stale |
| Duration | ~40 s (56 s wall time with force-exit) |

**Exit status: PASS.** All tests pass. No failures to investigate.

### Worker leak warning

```
A worker process has failed to exit gracefully and has been force exited. This is likely
caused by tests leaking due to improper teardown. Try running with --detectOpenHandles.
```

The warning fires alongside `src/lib/__tests__/openclaw-client.test.ts` (longest-running suite at ~21 s). The client's reconnect timers are not always fully drained between test cases. This does not affect correctness but inflates CI time and could mask real hangs. See **test-007** below.

---

## 2. Overall Coverage

| Metric | % | Covered | Total |
|---|---|---|---|
| Lines | **60.55%** | 4,075 | 6,729 |
| Statements | **58.98%** | 4,374 | 7,416 |
| Functions | **52.46%** | 810 | 1,544 |
| Branches | **46.68%** | 2,753 | 5,897 |

Branch coverage at 47% is the weakest dimension. Many conditionals in the protocol layer, media pipeline, and component render paths are exercised only by the happy-path tests.

---

## 3. Snapshot Freshness

All 70 snapshots passed without needing an update. The `src/components/chat/__tests__/__snapshots__/MessageBubble.test.tsx.snap.ios` file appears as modified in `git status`, but this reflects a change applied by a prior audit (X3/X4 visual sweep) — the current test run accepted it cleanly. No snapshot updates were performed by this audit.

---

## 4. Critical Module Coverage

### 4a. Coverage Table

| Module | Tested? | Lines% | Branch% | Fn% | Risk | Notes |
|---|---|---|---|---|---|---|
| `src/lib/openclaw/utils.ts` | Partial | 29% | 18% | 52% | **High** | `stripAnsi`, `parseMediaTokens`, `classifyMediaUrls`, `generateUUID` lack direct unit tests; only `parseInternalContextBlock` and a few helpers are covered. 16 of 20+ exported functions touch untested branches. |
| `src/lib/openclaw/client.ts` | Partial | 54% | 40% | 29% | **High** | Stream isolation and `connect` happy-path are well-tested. Reconnect/backoff paths, `_connectGeneration` guard on timeout, health-check pings, and ~100 internal functions are uncovered. _File is forbidden to edit._ |
| `src/lib/device-identity.ts` | Yes | 79% | 53% | 74% | **Med** | Core flows tested. Branch gaps in signing error paths and the fallback key-rotation scenario. |
| `src/lib/messageBlocks.ts` | Yes | 94% | 78% | 100% | **Low** | Good coverage; a few uncommon block-type combinations in branches are missed. |
| `src/lib/messageMerge.ts` | Partial | 59% | 52% | 100% | **Med** | All functions are called; the sub-comparators (`scalarsEqual`, `imageUrlsEqual`, `filesEqual`, `toolCallsEqual`, `thinkingBlocksEqual`, `partsEqual`) are exercised only via the public surface. Many internal branches around `null`/`undefined` array elements and empty-parts arrays are uncovered. |
| `src/lib/chatCache/crypto.ts` | No | 6% | 0% | 0% | **Critical** | `sealBytes` / `openBytes` have zero branch or function coverage. The 6% line coverage comes from the module-level constant being evaluated on import. AES-256-GCM round-trip is completely untested. |
| `src/lib/chatCache/validateBlob.ts` | Yes | 86% | 91% | 100% | **Low** | Strong coverage. Minor gaps in edge paths. |
| `src/lib/chatCache/store.ts` | No | 2% | 0% | 0% | **High** | File-system read/write/delete is entirely untested. Requires `expo-file-system` mock; the mock already exists in `src/__mocks__/expo-file-system.js`. |
| `src/lib/pickBestServerProfile.ts` | Partial | 22% | 7% | 50% | **High** | Pure function, 20 lines. The sorting tie-break on `isActive` and the multi-profile selection path are uncovered. |
| `src/lib/voice/extractSpeakableText.ts` | Yes | 100% | 100% | 100% | **None** | Fully covered. |
| `src/lib/voice/effectivePreferDeviceTts.ts` | Yes (relocated) | 100% | 100% | 100% | **None** | Function lives at `src/hooks/effectivePreferDeviceTts.ts`; covered by `src/hooks/__tests__/effectivePreferDeviceTts.test.ts`. Plan path is stale but coverage is complete. |
| `src/lib/purchases/products.ts` | No | N/A | N/A | N/A | **High** | `resolveTier`, `isFoundersWindowOpen`, `foundersWindowRemainingMs` are all pure functions with zero tests. Not instrumented by the current coverage run (no test imports these files). |
| `src/lib/purchases/client.ts` | No | N/A | N/A | N/A | **Med** | Requires `react-native-purchases` mock (already stubbed in `moduleNameMapper`). |
| `src/lib/supabase/serverPointers.ts` | Yes | 100% | 100% | 100% | **None** | Fully covered. |
| `src/lib/annotations.ts` | Yes | 96% | 91% | 100% | **Low** | Near-complete. |
| `src/lib/feedback/devBypassToken.ts` | No | N/A | N/A | N/A | **High** | All four functions (`getDevBypassToken`, `setDevBypassToken`, `clearDevBypassToken`, `getDevBypassTokenStatus`) are untested. Not instrumented (no test imports this file). |
| `src/lib/errors.ts` | No | 0% | 0% | 0% | **Low** | `ClawError` is a simple constructor. Risk is low; it is exercised implicitly by any test that imports code throwing `ClawError`, but it is not directly asserted. |

### 4b. Additional low-coverage files of note

| Module | Lines% | Branch% | Fn% | Risk |
|---|---|---|---|---|
| `src/lib/openclaw/chat.ts` | 4% | 2% | 6% | High — `chat.send`, `chat.history`, `chat.abort` core paths untested |
| `src/lib/openclaw/agents.ts` | 20% | 31% | 21% | Med |
| `src/lib/openclaw/sessions.ts` | 45% | 40% | 62% | Med |
| `src/lib/platform.ts` | 16% | 12% | 15% | Med — platform abstraction layer mostly untested |
| `src/lib/supabase/auth.ts` | 21% | 10% | 20% | Med |
| `src/hooks/useConnection.ts` | 41% | 16% | 38% | Med — reconnect + device-token paths sparse |
| `src/components/chat/MediaEmbed.tsx` | 23% | 30% | 12% | Med |
| `src/lib/media/diagnoseMediaFailure.ts` | 5% | 0% | 0% | Med |
| `src/lib/media/mediaActions.ts` | 5% | 0% | 0% | Med |

---

## 5. Test Infrastructure Review

### `jest.setup.js`

Mocks are appropriate and targeted:
- `expo-device`, `expo-secure-store`, `expo-crypto`, `@react-native-async-storage/async-storage`, `react-native` stubs cover the minimal surface the protocol layer needs in Node.
- `console.warn` and `console.log` are silenced globally. This is acceptable for the logic project but suppresses the `react-test-renderer` deprecation warnings that appear in the `components` project (see test-006 below).

One concern: `jest.setup.js` mocks `expo-secure-store` returning `null` from `getItemAsync` by default. Tests that need non-null returns must re-mock locally — which existing tests do correctly. This pattern is fine.

### `__mocks__/` directory

31 mock files cover all major native dependencies. Highlights:
- `expo-file-system.js` — adequate for testing `chatCache/store.ts` if a test is added.
- `expo-crypto-mock.js` — provides `getRandomBytesAsync` returning a 32-byte zero array. This is suitable for `chatCache/crypto.ts` tests (see test-001).
- `connection-context.js` / `use-server-config.js` / etc. — component-level mocks are present and targeted; not over-broad.

No manual mocks were found to be incorrect or outdated based on current source.

---

## 6. Findings

### test-001 — `chatCache/crypto.ts`: No encryption round-trip tests
**Severity:** Critical
**Module:** `src/lib/chatCache/crypto.ts`
**Coverage:** Lines 6%, Branches 0%, Functions 0%

`sealBytes` and `openBytes` implement AES-256-GCM encryption/decryption for local chat persistence. The key is generated and stored in the iOS Keychain. No test exercises the encrypt→decrypt round-trip, the short-packet rejection path (`packet.length < IV_LENGTH + 17`), or the missing-key early-return in `openBytes`.

**Proposed tests** (moderate complexity):
```
sealBytes / openBytes — round-trip:
  - mock SecureStore to return null (key creation path), then return the stored hex on second call
  - mock getRandomBytesAsync to return a fixed 32-byte IV
  - assert openBytes(sealBytes(plaintext)) === plaintext

openBytes — error cases:
  - returns null for a packet shorter than 29 bytes
  - returns null when SecureStore has no key (getExistingAes256Key returns null)
  - returns null when the ciphertext is corrupt (tampered byte)
```

**Mocks needed:** `expo-secure-store` (already in `jest.setup.js`), `expo-crypto` (already mocked with fixed 32-byte response), `@noble/ciphers` (real implementation — no mock needed; `transformIgnorePatterns` already allows `@noble` through).
**Complexity:** Moderate — requires coordinating two `SecureStore` call sequences and fixed-byte IV injection.

---

### test-002 — `lib/pickBestServerProfile.ts`: Pure function almost completely untested
**Severity:** High
**Module:** `src/lib/pickBestServerProfile.ts`
**Coverage:** Lines 22%, Branches 7%, Functions 50%

`pickBestServerProfile` is a pure sorting function that is called every time the app decides which server to connect to on launch. The `isActive` tie-break branch and multi-profile scenarios are uncovered.

**Proposed tests** (trivial — no mocks needed):
```
- empty array → null
- single profile → that profile
- two profiles, both with lastConnectedAt → picks the more recent one
- two profiles, same lastConnectedAt, one isActive → picks the isActive one
- two profiles, neither lastConnectedAt, neither isActive → picks index 0
- three profiles, mixed timestamps → correct sort order
```
**Complexity:** Trivial — pure function, zero deps.

---

### test-003 — `lib/purchases/products.ts`: Entitlement logic untested
**Severity:** High
**Module:** `src/lib/purchases/products.ts`
**Coverage:** Not instrumented (no test imports)

`resolveTier`, `isFoundersWindowOpen`, and `foundersWindowRemainingMs` are all pure functions. `resolveTier` maps RevenueCat entitlement IDs to the in-app tier; incorrect behavior here directly affects what users can access.

**Proposed tests** (trivial — no mocks needed):
```
resolveTier:
  - [] → 'free'
  - ['pro'] → 'pro'
  - ['founder'] → 'founder'
  - ['pro', 'founder'] → 'founder' (founder beats pro)
  - ['unknown'] → 'free'

isFoundersWindowOpen:
  - null launchAt → false
  - now < launchAt → false
  - now >= launchAt and now < launchAt+60d → true
  - now >= launchAt+60d → false

foundersWindowRemainingMs:
  - null launchAt → 0
  - past window → 0
  - within window → positive number ≈ expected ms
```
**Complexity:** Trivial — pure functions, no imports needed beyond the module under test.

---

### test-004 — `lib/feedback/devBypassToken.ts`: Keychain token helpers untested
**Severity:** High
**Module:** `src/lib/feedback/devBypassToken.ts`
**Coverage:** Not instrumented (no test imports)

`setDevBypassToken`, `getDevBypassToken`, `clearDevBypassToken`, and `getDevBypassTokenStatus` manage a stored bypass secret for the feedback worker. The minimum-length guard (`DEV_BYPASS_TOKEN_MIN_LENGTH = 16`) and masking preview logic are completely untested.

**Proposed tests** (moderate — SecureStore mock coordination):
```
getDevBypassToken:
  - SecureStore returns null → null
  - SecureStore returns string shorter than 16 chars → null
  - SecureStore returns valid string → that string (trimmed)

setDevBypassToken:
  - empty string → throws ClawError('feedback_token_empty')
  - string of 15 chars → throws ClawError('feedback_token_too_short', { min: 16 })
  - string of 16+ chars → calls SecureStore.setItemAsync with trimmed value

clearDevBypassToken:
  - calls SecureStore.deleteItemAsync
  - does not throw when deleteItemAsync rejects

getDevBypassTokenStatus:
  - when no token → { set: false, preview: null }
  - when token set (>8 chars) → { set: true, preview: 'abcd…wxyz' }
  - when token is ≤8 chars → { set: true, preview: first2…last2 }
```
**Mocks needed:** `expo-secure-store` (already globally mocked; needs per-test overrides).
**Complexity:** Moderate.

---

### test-005 — `lib/openclaw/utils.ts`: Core text-processing functions lack unit tests
**Severity:** High
**Module:** `src/lib/openclaw/utils.ts`
**Coverage:** Lines 29%, Branches 18%, Functions 52%

`stripAnsi`, `parseMediaTokens`, `classifyMediaUrls`, and `generateUUID` are used throughout the app but have no dedicated test file. Coverage comes incidentally through `parseInternalContextBlock` tests. Many exported functions — `extractToolResultText`, `extractImagesFromContent`, `extractTextFromContent`, `stripBase64FromStreaming`, `stripSystemNotifications`, `stripConversationMetadata`, `resolveSessionKey`, `toIsoTimestamp`, `resolveAvatarUrl` — are completely uncovered.

**Proposed tests** (moderate):
```
stripAnsi:
  - strips CSI sequences (\x1b[31m)
  - strips OSC sequences (\x1b]0;title\x07)
  - passthrough of plain text
  - empty string → empty string

parseMediaTokens:
  - text with "MEDIA: https://..." → extracts URL
  - text with multiple MEDIA: tokens
  - text without MEDIA: tokens → empty arrays

classifyMediaUrls:
  - image extensions (.png, .jpg, .webp) → images[]
  - audio extensions (.mp3, .wav) → audio[]
  - video extensions (.mp4) → videos[]
  - gateway-relative URLs with gatewayUrl prefix

generateUUID:
  - returns a string matching /^[0-9a-f-]{36}$/
  - returns unique values on successive calls

extractToolResultText:
  - string input → returned as-is
  - { content: [{type:'text', text:'hello'}] } → 'hello'
  - { text: 'fallback' } → 'fallback'
  - null / undefined → undefined
```
**Mocks needed:** None — pure functions (no native deps in the functions listed above).
**Complexity:** Moderate (large surface, but each assertion is simple).

---

### test-006 — `react-test-renderer` deprecation warnings not suppressed in components project
**Severity:** Low
**Module:** `src/__mocks__/component-test-setup.js` / `jest.setup.js`

The `logic` project silences `console.error` via the global spy, but the `components` project's `component-test-setup.js` does not. Two tests in `useConnection.pinMismatch.test.ts` emit `console.error` about `react-test-renderer` being deprecated. While this is upstream library noise, it pollutes test output and could mask legitimate `console.error` calls.

**Proposed fix** (proposed — behavioral change to setup file):
Add to `src/__mocks__/component-test-setup.js`:
```js
// Suppress react-test-renderer deprecation noise (upstream @testing-library/react-native)
const originalError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return;
    originalError.call(console, ...args);
  });
});
```

---

### test-007 — Open handles in `openclaw-client.test.ts`
**Severity:** Low
**Module:** `src/lib/__tests__/openclaw-client.test.ts`

The force-exit warning fires after the openclaw client suite. The `OpenClawClient` runs reconnect timers (`setTimeout` / `setInterval`) that are not always cleared after tests end. The `afterEach` calls `client.disconnect()` which should clear them, but some test paths may leave a timer running (e.g., when `connect()` was never called or threw before registering the timer).

**Proposed fix** (proposed — behavior change):
Call `jest.useFakeTimers()` in `beforeEach` and `jest.useRealTimers()` in `afterEach` for the reconnect-related test suite, or use `jest.runAllTimers()` / `jest.clearAllTimers()` after each test. This is a behavioral change to the test setup and requires review.

---

### test-008 — `chatCache/store.ts` is essentially untested
**Severity:** High
**Module:** `src/lib/chatCache/store.ts`
**Coverage:** Lines 2%, Branches 0%, Functions 0%

The file-system-backed session cache store has no tests. The only coverage is the module-level constant evaluation on import. This module calls `sealBytes`/`openBytes`, `FileSystem.readAsStringAsync`, `FileSystem.writeAsStringAsync`, `FileSystem.makeDirectoryAsync`, and `FileSystem.deleteAsync`. Bugs here cause silent chat-history loss.

**Proposed tests** (complex — requires FileSystem mock coordination):
```
readSession:
  - file does not exist → null
  - file exists but openBytes returns null (corrupt) → null
  - file exists and decrypts successfully → parsed blob

writeSession:
  - creates cache dir if missing
  - writes sealed bytes as base64

deleteSession:
  - calls FileSystem.deleteAsync with correct path
```
**Mocks needed:** `expo-file-system` (mock already at `src/__mocks__/expo-file-system.js`), `chatCache/crypto` (mock `sealBytes`/`openBytes`).
**Complexity:** Complex — multi-step async mock setup.

---

### test-009 — `lib/messageMerge.ts`: Internal comparators lack branch coverage
**Severity:** Med
**Module:** `src/lib/messageMerge.ts`
**Coverage:** Lines 59%, Branches 52%, Functions 100%

All functions are exercised but internal comparators (`scalarsEqual`, `imageUrlsEqual`, `filesEqual`, `toolCallsEqual`, `thinkingBlocksEqual`, `partsEqual`) are tested only via the public `chatMessagesEqual` surface. Several branches within these — particularly handling `null`/`undefined` arrays, empty-parts arrays, and multi-tool-call ordering — are not reached.

**Proposed tests** (moderate):
- `chatMessagesEqual` with messages containing `images`, `files`, `toolCalls`, `parts`, and `thinkingBlocks` arrays at various lengths and null/undefined states.
- `mergeMessagesPreservingIdentity` with abort state (`isAborted` toggling), streaming flag changes, and empty parts arrays.
**Complexity:** Moderate.

---

### test-010 — `lib/openclaw/client.ts`: Backoff and reconnect paths uncovered
**Severity:** High (flagged only — file is forbidden to edit)
**Module:** `src/lib/openclaw/client.ts`
**Coverage:** Lines 54%, Branches 40%, Functions 29%

The existing test suite covers: constructor, happy-path connect, stream isolation, thinking/compaction streams, per-session guards, RPC methods (listSessions, listAgents, sendMessage, etc.), and resetSession. Uncovered areas include:
- Exponential backoff reconnect loop (`_scheduleReconnect`, `_reconnectAttempts`)
- `_connectGeneration` guard cancelling stale async ops on reconnect
- Health check ping (`_startHealthCheck`) and timeout path
- `onmessage` → malformed frame handling (non-JSON, missing `type`)
- Certificate pinning error path
- `chat.abort` RPC

These paths are complex to test due to timer dependencies and require fake-timer coordination. **This file is forbidden — no changes allowed.** The gap is documented for awareness. Tests can be proposed and added to the existing test file without modifying `client.ts`.

**Proposed additions to `openclaw-client.test.ts`** (complex):
- Use `jest.useFakeTimers()` to test backoff scheduling without real delays
- Assert `_connectGeneration` increments on each `connect()` call
- Mock `WebSocket.close()` to trigger reconnect and verify backoff delay sequence

---

## 7. Auto-fixes Applied

None. No auto-fixes were applicable in this audit's scope. All issues are either proposed test additions (requiring human sign-off) or pre-existing coverage gaps.

---

## 8. Summary

| Finding | Severity | Type | Module |
|---|---|---|---|
| test-001 | Critical | Proposed | `chatCache/crypto.ts` — no round-trip tests |
| test-002 | High | Proposed | `pickBestServerProfile.ts` — pure fn untested |
| test-003 | High | Proposed | `purchases/products.ts` — entitlement logic untested |
| test-004 | High | Proposed | `feedback/devBypassToken.ts` — token helpers untested |
| test-005 | High | Proposed | `openclaw/utils.ts` — core text fns uncovered |
| test-006 | Low | Proposed | `component-test-setup.js` — console.error noise |
| test-007 | Low | Proposed | `openclaw-client.test.ts` — open handles / timer leak |
| test-008 | High | Proposed | `chatCache/store.ts` — file I/O untested |
| test-009 | Med | Proposed | `messageMerge.ts` — internal comparator branches |
| test-010 | High | Flagged (no edit) | `openclaw/client.ts` — backoff/reconnect uncovered |

**Priority order for human follow-up:**
1. test-001 (`chatCache/crypto`) — data integrity risk
2. test-003 (`purchases/products`) + test-004 (`devBypassToken`) — trivial/moderate, high value
3. test-002 (`pickBestServerProfile`) — trivial, 5-minute job
4. test-008 (`chatCache/store`) — complex but important
5. test-005 (`openclaw/utils`) — high surface area, good ROI
6. test-010 (`openclaw/client` reconnect) — complex, requires fake timers
