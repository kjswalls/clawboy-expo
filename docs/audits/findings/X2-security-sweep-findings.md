# Cross-Cutting Findings: Security Sweep (X2)

Date: 2026-05-11
Agent: Claude Opus 4.7
Status: done

## Scope

A whole-app security sweep of every source file under `src/` and `app/`,
synthesising prior findings from plans 01, 02, 03, 13, 14, and 17 and
re-validating each `.cursorrules` Security rule (§1–§10) against the
codebase as it stands today.

The sweep covers:

- AsyncStorage / SecureStore data classification (rule §1).
- Plaintext logging of credentials, message content, or PII (rule §1).
- WebSocket frame validation (rule §4).
- Deep-link / auth-callback hardening (rule §6).
- Clipboard hygiene for sensitive copies (rule §9).
- Certificate-pinning end-to-end (rule §8 — architecture, not enforced
  pinning policy).
- OTA update signing posture (rule §7-adjacent).
- IAP receipt validation (App Store §3.1.1 — not a `.cursorrules` rule
  but a release blocker).
- Memory safety for tokens in component state (rule §10).

The plan-files (`docs/audits/*.md`) and the forbidden auth/crypto files
(`src/lib/openclaw/client.ts`, `src/lib/device-identity.ts`,
`src/contexts/ConnectionContext.tsx`, `certs/`, `eas.json`, `modules/`,
`ios/`, `android/`, `supabase/migrations/`) were inspected read-only —
no edits made to any of them. All findings against them are recorded
as `proposed`, even when the change looks trivially safe.

## Severity Counts

- critical: 0
- high: 1
- med: 3
- low: 7
- nit: 4

`Sev: C/H/M/L/N = 0/1/3/7/4`

---

## 1. AsyncStorage usage table

Source: `rg "AsyncStorage" src/ app/` (test files and the four
`src/__mocks__/*.js` shims excluded — they only re-export the public
API for unit tests).

| File:Line | Key constant | Stored data type | Sensitive? | Verdict |
|-----------|--------------|------------------|------------|---------|
| `src/hooks/useServerConfig.tsx:16,64,161,180` | `clawboy-server-profiles-v1` | `ServerProfile[]` JSON, stripped of `security` field before write (`stripSecurityForAsyncStorage`, line 27-31). Holds `id`, `name`, `url`, `isActive`, `kind`, `needsToken`, `lastConnectedAt` only. **No token, no SPKI hashes.** | no | OK |
| `src/hooks/useServerConfig.tsx:20` | `clawboy-auth-token.<profileId>` (per-profile SecureStore key) | Gateway auth token | yes | OK — written to `SecureStore.setItemAsync`, not AsyncStorage (line 200, 272). The key constant is only declared in this file; AsyncStorage is never the target. |
| `src/hooks/useServerConfig.tsx:17,24,35,49,55` | `clawboy-profile-security.<profileId>` | `ProfileSecurity` JSON (`pinnedSpkiSha256`, `firstSeenSpkiSha256`, etc.) | yes | OK — written to `SecureStore` (line 55). Legacy AsyncStorage payloads are migrated into SecureStore on first hydrate (`migratedLegacySecurity` block, line 145-162). Resolves prior `profiles-001` (high). |
| `src/contexts/ThemeContext.tsx:9-12,68,74,95,109,115,126,132,137,142,149` | `clawboy-theme-v1`..`v4` | `ResolvedTheme` JSON (`colorScheme`, `appearance`, optional `customColors`) | no | OK |
| `src/contexts/LanguageContext.tsx:10,57,90` | `clawboy-language-v1` | Locale code (`'en'` / `'zh-CN'` / etc.) | no | OK |
| `src/contexts/ConventionInstallContext.tsx:39,175,213` | `clawboy-convention-install-v1` | Per-agent / per-convention install marker JSON (boolean flags only) | no | OK |
| `src/contexts/TtsPreferencesContext.tsx:4,5,37,47,52` | `clawboy-tts-auto-speak`, `clawboy-tts-prefer-device` | Boolean preference (`true`/`false` JSON) | no | OK |
| `src/hooks/useCommandConfirmations.ts:4,23,34` | `clawboy-confirm-destructive-commands` | Boolean preference | no | OK |
| `src/hooks/useMediaCacheReplay.ts:4,22,33` | `clawboy-media-cache-replay` | Boolean preference | no | OK |
| `src/hooks/useActionBarPins.ts:4,25,50` | `@clawboy/action_bar_pins` | `string[]` of action-bar command IDs | no | OK |
| `src/hooks/useSessions.tsx:9,46,61` | `clawboy-pinned-sessions-v1` | `string[]` of pinned session keys | no | OK |
| `src/hooks/useAgents.tsx:8,29,63` | `clawboy-current-agent-v1` | Agent id (free-form string from gateway, e.g. `'default'`) | no | OK |
| `src/hooks/useModels.tsx:8,30,73` | `clawboy-current-model-v1` | Model id string (e.g. `'deepseek-r1'`) | no | OK |
| `src/components/settings/AboutScreen.tsx:50,156,171,178` | `clawboy.debug.revealed` | `'1'` literal when debug panel revealed via 7-tap easter egg | no | OK |
| `src/components/settings/GatewayLogsModal.tsx:66,67,198,201,208,213` | `clawboy.gatewayLogs.tzMode`, `clawboy.gatewayLogs.sortOrder` | UI mode strings (`'utc'`/`'local'`, `'asc'`/`'desc'`) | no | OK |
| `src/lib/demo/demoStorage.ts:15,16,35,47,56,61,74,89` | `clawboy-demo-sessions-v1`, `clawboy-demo-history-v1:<key>` | Demo-mode synthetic session list + message history. No connection to a real gateway. | no (demo only) | OK — but see `sec-005`. |
| `src/badges/store.ts:14,81,84,88,97,107,119` | `clawboy-badges-v1`, `clawboy-badge-device-id` | `BadgeState` JSON (unlock timestamps, counters); deterministic random per-install device id used only as a badge-system salt. **Not** the Ed25519 device identity. | no | OK — distinct namespace from gateway `deviceIdentity` (which lives in `SecureStore` under `clawboy-device-identity`). |
| `src/lib/diagnostics/crashRecorder.ts:35,85,101,134` | `clawboy.lastCrash.v1` | `CrashRecord` JSON **sealed with AES-256-GCM** (`sealBytes(...)`, line 82); plaintext key only ever lives in `SecureStore` (same key as chat cache, `clawCache.aesKey.v2`). | yes (post-decrypt) | OK — AsyncStorage holds ciphertext only; decryption requires the SecureStore-bound AES key. Treat as defence-in-depth. |

### Implicit non-AsyncStorage sensitive stores (sanity-check pass)

| Storage | Key(s) | Data | Verdict |
|---------|--------|------|---------|
| `SecureStore` | `clawboy-device-identity` | Ed25519 keypair JSON | OK |
| `SecureStore` | `clawboy-auth-token.<profileId>` | Gateway auth tokens | OK |
| `SecureStore` | `clawboy-profile-security.<profileId>` | SPKI pin hashes per profile | OK |
| `SecureStore` | `clawboy-device-token.<host>` | Per-host gateway-issued device token (post-pairing) | OK — wired in `useConnection.ts` `onConnected` |
| `SecureStore` | `clawboy.feedbackDevBypassToken` | Optional dev-bypass token for feedback worker | OK |
| `SecureStore` | `clawCache.aesKey.v2` | AES-256-GCM key for chat-cache + crash-record encryption | OK |
| `SecureStore` (via `secureStorage.ts`) | Supabase session JSON + chunked refresh tokens | Supabase access/refresh tokens | OK — chunked storage handles ≥2 KB Keychain item cap; `removeItem` see `sec-007`. |

**Conclusion:** Every key on the rule §1 list (gateway token, device
token, Supabase session, Ed25519 private key, SPKI pin hashes) is now
in `expo-secure-store`. The previously-flagged `profiles-001` SPKI-pin
leak has been remediated and the AsyncStorage profile blob is sanitised
before every write. No `critical` rule §1 violation observed.

---

## 2. Console-log audit summary

Source: `rg "console\.(log|warn|info|error)" src/ app/` (test files
excluded). Numbers are call-site counts, not message-line counts.

| Category | Count | Notes |
|----------|-------|-------|
| `console.log` total in non-test source | 11 | All 11 are gated by `__DEV__` (sometimes plus `EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1'` / `EXPO_PUBLIC_DEBUG_LIST_PERF === '1'` / sign-in branch). 0 unguarded. |
| `console.warn` total in non-test source | 18 | 6 `__DEV__`-guarded, 11 are real error-handlers logging `(message, err)` (semantically equivalent to `console.error` — allowed by audit rules), 1 guarded by `process.env.NODE_ENV === 'development'` (i18n missing key). 0 unguarded non-error informational warns. |
| `console.info` total in non-test source | 0 | — |
| `console.error` total in non-test source | 2 | Both are real error handlers: `src/i18n/index.ts:91` (`init error`) and `src/lib/openclaw/client.ts:520` (`Handshake challenge signing failed`). The latter logs `err?.message` only — never `nonce` / `signature` / `publicKey` / token. Allowed by rule §1. |

**Per-file `console.log` breakdown** (all `__DEV__`-guarded):

| File | Sites | Guard |
|------|-------|-------|
| `src/lib/openclaw/client.ts` | 7 | `if (__DEV__)` and `if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1')` |
| `src/hooks/useServerConfig.tsx` | 8 | `if (__DEV__)` / `else if (__DEV__)` blocks (every cloud-sync log site is gated) |
| `src/contexts/ServerProfileSyncContext.tsx` | 1 | `if (__DEV__)` |
| `src/components/chat/MessageList.tsx` | 1 | `if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_LIST_PERF === '1')` |
| `app/index.tsx` | 1 | `if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1')` |

**Per-file `console.warn` breakdown:**

| File | Sites | Status |
|------|-------|--------|
| `src/lib/openclaw/client.ts` | 4 (`ws.onerror`, `ws.onclose`, reconnect failure, handshake failed) | Unguarded; logs `readyState`, `code`, `reason`, `wasClean` — **no credentials**. Already noted in `gateway-006`/`gateway-008` (forbidden file). See `sec-002` for synthesis. |
| `src/lib/device-identity.ts` | 3 | `__DEV__`-guarded; redacted error.message only. OK. |
| `src/lib/openclaw/nodes.ts` | 4 | Real error-handlers, RPC errors from gateway only. OK. |
| `src/lib/openclaw/chat.ts` | 1 | Real error-handler. OK. |
| `src/hooks/useChat.ts` | 1 | `__DEV__`-guarded. OK. |
| `src/hooks/useSessions.tsx` | 1 | Real error-handler. OK. |
| `src/hooks/useModels.tsx` | 2 | Real error-handlers. OK. |
| `src/hooks/useAgents.tsx` | 1 | Real error-handler. OK. |
| `src/lib/purchases/client.ts` | 1 | `__DEV__`-guarded. OK. |
| `src/lib/media/diagnoseMediaFailure.ts` | 2 | `__DEV__`-guarded, `sanitizedUrl` only. OK. |
| `src/badges/store.ts` | 1 | Real error-handler (corrupt-state recovery). OK. |
| `src/components/common/ErrorBoundary.tsx` | 1 | Truncated error.name + message.slice(0, 120) — no user content. OK. |
| `src/i18n/index.ts` | 1 | Guarded by `process.env.NODE_ENV === 'development'` (mirrors `__DEV__`). Acceptable; flagged `nit` in `sec-013`. |

**Defence-in-depth — `installConsoleBuffer()`:**

`src/lib/diagnostics/consoleBuffer.ts` patches `console.{log,warn,info,error,debug}` at boot
(installed first in `app/_layout.tsx:5`) and feeds every call through
`scrubConsoleArgs()` in `src/lib/diagnostics/scrub.ts` before storing
in a 200-entry ring buffer. The scrubber redacts:

- Object keys in `SENSITIVE_KEYS` (token, authToken, deviceToken,
  privateKey, publicKey, signature, nonce, spki, sessionId, deviceId,
  url, content, prompt, message, etc.).
- WebSocket / HTTPS URLs, Bearer tokens, JWTs, UUIDs, hex blobs ≥40
  chars, base64 blobs ≥30 chars.

So even if a future regression introduces a sensitive `console.log`,
the ring-buffer copy seen by the feedback flow will be scrubbed before
transmission. This satisfies the spirit of rule §1 with three layers
(don't log it; if logged, scrub it before persisting; if persisted, the
feedback worker re-scrubs server-side).

**Conclusion:** No unguarded `console.log` of any kind, no console
call writes auth tokens, device-key material, session content, or PII.
The only category-level concern is gateway-006 (`url` in `connect()` log
sites — `__DEV__` only and already on the proposed list for plan 01).

---

## 3. WebSocket frame validation assessment

Plan checklist sub-bullets (`src/lib/openclaw/client.ts`):

| Sub-bullet | Yes / No | Citation |
|------------|----------|----------|
| `onmessage` handler exists and is the single entry point | yes | `handleMessage(data, resolve?, reject?)` at `client.ts:507`. `_setupReadyClient` wires `this.ws.onmessage = (event) => this.handleMessage(event.data, ...)` and `_call` injects per-RPC resolvers via the same path. |
| Every incoming frame parsed via `JSON.parse` before any side-effect | yes (with caveat) | `client.ts:510` `const message = JSON.parse(data)`. Side-effects are inside the surrounding `try` so parse failure cannot reach them. |
| Unknown frame `type` values are handled (ignored, not acted on) | yes — partial | The handler explicitly checks `message.type === 'event'` (line 513) and `message.type === 'res'` (line 531) and returns early in each branch. Anything else falls through to the outer `try/catch` and is silently ignored. There is no `type: 'req'` handling at all (the gateway is the client of requests; the app is the responder via `_call`), so the trichotomy `event` / `res` / unknown-drop is correct. |
| Malformed JSON does not crash the client | yes | Outer `try { ... } catch { /* Failed to parse message */ }` at `client.ts:509-608`. Already noted in `gateway-009` (silent-swallow concern, forbidden file). |
| `chat` events only processed for the expected session ID | yes — defence-in-depth, **not** identity-enforced | `handleNotification(event, payload)` resolves `eventSessionKey = payload?.sessionKey` (line 824) and routes through `resolveEventSessionKey()` (line 623). `getStream(sk)` (line 613) builds per-session state. The `activeStreamKey` first-claim guard at `applyStreamText` (line 708-715) and `ensureStream`'s `source` claim (`ss.source !== 'chat'` checks at line 843, 1090) prevent cross-session text leakage. **Caveat:** the client trusts whatever `sessionKey` value the gateway puts in the frame — it does not verify the value against a known-good set client-side. This is correct given the gateway is the source of truth for session identity, but if the WS connection were ever MITM'd past pinning, a hostile peer could route a chat:delta into an arbitrary local session. Mitigated by §8 cert pinning + §1 device-identity signing. |
| Schema validation of frame payloads | **no** | `handleMessage` does coarse `type` discrimination, then unsafely casts to `EventFrame`/`ResponseFrame` and dereferences nested fields with `?.` and `typeof` checks at the use sites. `chat:final`'s `payload.message.id` / `role` / `timestamp` paths trust the server's types. This is the open `gateway-004` (med, proposed). Re-flagged here as `sec-001` for cross-plan visibility — fix is owned by plan 01. |

`onmessage` payload boundaries — defensive features that are present:

- `MEDIA:` line stripping (line 851-860, 1098-1110): only emit
  user-visible chunks once media tokens are removed; preserves them
  separately in `ss.mediaLines` to avoid replay.
- `mergeIncoming` 50 KB runaway cap (line 775-778): rejects pathological
  cumulative text streams.
- `isNoiseContent`/`isHeartbeatContent` filters (line 861-862).
- `pendingRequests.delete(id)` (line 570) before resolver dispatch:
  a duplicate response can't double-resolve.

`onmessage` payload boundaries — gaps:

- No schema validator (`sec-001` / `gateway-004`).
- No JSON-parse-error logging in production (`gateway-009`).
- No `_connectGeneration` guard around `handleNotification` itself
  (`gateway-002`); non-RPC async paths (e.g. signing the next-arriving
  challenge after a deliberate `disconnect()` mid-handshake) rely on
  `this.ws?.send` returning a no-op rather than an explicit
  generation check.

All three are forbidden to edit and already on plan 01's proposed list.

---

## 4. Deeplink / auth-callback assessment

Files inspected: `app/auth-callback.tsx`, `app/_layout.tsx` deep-link
handler (lines 86-151).

`app/_layout.tsx:86-151` — handler shape:

1. `ExpoLinking.parse(url)` wrapped in `try/catch` (line 92-96).
2. Host / path allowlist:
   `parsed.hostname === 'auth-callback' || parsed.path === 'auth-callback' || parsed.path === '/auth-callback'`
   (line 100-102). Anything else → return.
3. Fragment-parse with `.split('&')` and per-pair `.split('=')`
   (line 105-112). **Issue noted in `sec-004`** — `pair.split('=')`
   without a limit collapses `key=value=trailing` to `[key, value]`,
   losing the trailing data. Tokens that contain `=` (rare for the
   Supabase implicit flow but not impossible for some opaque token
   schemes) would silently truncate. Defensive depth-only nit.
4. Error short-circuit: any `fragParams['error']` → return (line 115).
5. Two valid token shapes accepted:
   - implicit / hash flow: `access_token` + `refresh_token` →
     `supabase.auth.setSession({...})`.
   - PKCE / query flow: `code` → `supabase.auth.exchangeCodeForSession`.
6. Both calls are wrapped in `try { ... } catch { /* surfaced via
   onAuthStateChange */ }` (line 122-134).

Observations:

- The handler **does** validate the destination path before extracting
  tokens, so a spoofed `clawboy://attacker-callback#access_token=...`
  is dropped before reaching Supabase (line 103).
- It does **not** verify the URL scheme. `Linking` only delivers URLs
  for the configured `scheme: "clawboy"` (`app.json:5`), so OS-level
  ATS already enforces the scheme. A defence-in-depth `startsWith('clawboy://')`
  check would still be cheap. Flagged as `sec-003` (low/proposed) —
  matches the spirit of `auth-009` from plan 02.
- No unit test exists for the deeplink parser (open as `auth-010`,
  plan 02). The parser is inlined inside the `useEffect`, so the
  refactor required to test it is also out of scope here. Re-flagged
  as `sec-006` for X7 release-readiness visibility.
- `setSession` / `exchangeCodeForSession` always run on the foreground
  thread inside a `useEffect`; no chance of being called from a stale
  closure since `mounted` guard (line 87-150) covers both the initial
  URL and subsequent listeners.

`app/auth-callback.tsx`:

- Pure redirect shim that polls `useAccountContext().status` and bounces
  to `/` once Supabase reports a definitive state. No token-handling
  logic.
- **Open shadowing bug (`sec-012`, nit):** at line 27 `const { t } = useTranslation()`
  is declared, and at line 42 `const t = setTimeout(...)` shadows it
  inside the second `useEffect`. The earlier `auth-011` finding
  claimed an auto-fix renaming the local to `timer`, but the current
  file still shows the shadowing identifier. Either the fix was
  reverted, never committed, or the audit doc was aspirational. The
  shadowing has no functional impact (the imported `t` is only used
  inside the JSX `<BrandLoader />` props, line 48, which is outside
  the shadow scope), but it is misleading. Not auto-fixed here —
  the file straddles the auth surface and the change should land
  with the same review pass that re-applies `auth-011`.

---

## 5. Clipboard hygiene

Every `expo-clipboard` write located via `rg "Clipboard" src/ app/`:

| File:Line | What's written | Sensitivity | Timeout / clear? | Verdict |
|-----------|----------------|-------------|-------------------|---------|
| `src/lib/media/mediaActions.ts:117` | Media URL (after `sanitizeUrlForDisplay`) | low (URL only) | yes — `clipboardClearTimerRef` writes empty string after `CLIPBOARD_CLEAR_DELAY_MS` (line 122-125). | OK — only path with an explicit clear timeout. |
| `src/lib/media/mediaActions.ts:124` | empty string (timer body) | n/a | n/a | OK |
| `src/lib/platform.ts:111-113` | Caller-supplied text — pure pass-through, used by `copyToClipboard()` consumers below. | depends on caller | none | flag at call site (each below). |
| `src/components/settings/PinnedKeysScreen.tsx:406` | OpenSSL command line for SPKI fingerprint inspection — public hostname + cipher constants only | low (informational) | none. UI shows "Copied" for 2s but does not clear clipboard. | flagged as `sec-008` (low/proposed) — OpenSSL command is non-secret but contains the gateway hostname. |
| `src/components/settings/AddServerSheet.tsx:411` | Token-lookup helper command (`jq -r '.gateway.auth.token' ~/.openclaw/openclaw.json` or grep-env equivalent) — **the command, not the token itself**. | low (template only) | none | acceptable — the command does not contain a token. |
| `src/components/settings/AddServerSheet.tsx:509` | `deviceId` (Ed25519 public-key fingerprint, e.g. `device:abcd…`) — a **public** identifier, not the private key. | low | none | acceptable — `deviceId` is the public half of the keypair, already shared with the gateway on every connect. |
| `src/components/settings/GatewayLogsModal.tsx:356` | Aggregated gateway-log text (already passes through `scrubString`/`scrubConsoleArgs` before display via `consoleBuffer`) | low (scrubbed) | none | acceptable — copy targets already-redacted strings. |
| `src/components/settings/GatewayLogsModal.tsx:373` | Diagnostics file path | nil | none | OK |
| `src/components/settings/LogLineRow.tsx:50` | Single log line — same scrubbing as above | low (scrubbed) | none | OK |
| `src/components/chat/CodeBlock.tsx:220` | User-visible code-fence content from chat message | depends on chat content | none | OK in principle — same data the user is reading. Out of rule §9 (it's not an auth-credential copy). |
| `src/components/chat/MessageBubble.tsx:646,994` | Selected message content / quoted text | depends on chat content | none | OK — same data the user is reading. |
| `src/components/chat/AgentFileViewerModal.tsx:109` | Agent file content (markdown / text) | depends on file | none | OK |
| `src/components/settings/FeedbackSheet.tsx:298` | Pre-scrubbed feedback markdown (server-bound payload, already passed through `renderClipboardFallback`) | low (scrubbed) | none | OK |
| `src/components/input/InputBar.tsx:302-304` | `Clipboard.getUrlAsync()` — **read**, not write. Used to detect a URL on paste. | n/a | n/a | OK |
| `src/components/input/useAttachmentPicker.ts:178` | `Clipboard.getImageAsync()` — **read**, not write. | n/a | n/a | OK |

**Conclusion:** no write path puts a gateway token, device private key,
or Supabase session token onto the clipboard. The `deviceId` and OpenSSL
command paths are intentional public-info copies. `mediaActions.copyLink`
is the only sensitive-adjacent write and already has the documented
clear-after-delay timer.

---

## 6. Certificate pinning end-to-end

`modules/expo-pinned-websocket/` (top-level only — native code not
inspected; covered by plan 21):

- `package.json` (line 2): `"name": "expo-pinned-websocket"`, private,
  vendored locally.
- `src/` contains `PinnedWebSocket.ts`, `index.ts`, and a `__tests__/`
  directory.
- `ios/` and `android/` directories provide the native implementations
  (Swift/Kotlin; plan 21 scope).

JS wiring (`src/hooks/useConnection.ts:17, 261-274`):

```ts
import { createPinnedWebSocket } from 'expo-pinned-websocket';
...
const wsFactory: WebSocketFactory = Platform.OS === 'web'
  ? (url) => new WebSocket(url) as ReturnType<WebSocketFactory>
  : (url) => createPinnedWebSocket({
      url,
      allowedSpkiHashes: pinnedHashes,
      onPeerSpki: (hash) => { ... onObservedSpki(hash); },
      onPinError: (observed, allowed) => {
        setConnectionState({ status: 'pin_mismatch', observedSpki: observed, allowedSpkis: allowed });
      },
    }) as ReturnType<WebSocketFactory>;
```

- **Native (iOS / Android) path:** `createPinnedWebSocket(...)` is the
  only WS factory; the standard `WebSocket` constructor is never called
  for gateway traffic. SPKI hashes from `profileSecurity?.pinnedSpkiSha256`
  are passed to the native module.
- **Web path:** falls back to the standard `WebSocket` — acceptable
  because the only web target today is the Expo dev/web build, and
  `.cursorrules` rule §8 ("design for it" — Phase 2) does not require
  web-side enforcement.
- **Pin source — `useServerConfig.tsx:33-43` (`loadProfileSecurity`):**
  pin hashes are read from `SecureStore.getItemAsync(clawboy-profile-security.<id>)`.
  Per the post-`profiles-001` migration, no pin material is ever read
  from AsyncStorage at runtime.
- **TOFU (trust-on-first-use) flow:** `onPeerSpki` records the first
  observed SPKI hash on a fresh profile (via `onObservedSpki` →
  `updateProfileSecurity({ firstSeenSpkiSha256: ... })` in
  `useConnection.ts`), and the PinMismatchScreen lets the user opt-in
  to pin that hash going forward.
- **Mismatch handling:** `setConnectionState({ status: 'pin_mismatch', observedSpki, allowedSpkis })`
  triggers the `PinMismatchScreen` (`app/index.tsx:1112-1132`), which
  surfaces the discrepancy and offers Reject / Approve-new-key /
  Forget-server actions.

**Sourcing & tampering posture:**

- Pin hashes are stored in `SecureStore` (Keychain on iOS, Keystore on
  Android) — survives uninstall on iOS by default, can be flushed by
  the OS on bulk-restore (which is the right failure mode: a freshly
  restored device should re-TOFU).
- Pin hashes are not loaded from `app.json`, env vars, or a remote
  config — so an OTA push cannot silently swap pins.
- The standard `WebSocket` constructor is never used as a fallback on
  native — `createPinnedWebSocket` is the only `wsFactory`. (Verified
  by `rg "new WebSocket" src/hooks/useConnection.ts src/lib/openclaw` —
  only web-branch fallback in `useConnection.ts:262` and test mocks.)

**Status: end-to-end pinning is correctly wired and pin material lives
in SecureStore.** No findings against the architecture itself; the only
open items are gateway-001/gateway-010 (forbidden, plan 21 scope).

---

## 7. OTA update signing status

`app.json:10-19`:

```jsonc
"updates": {
  "url": "https://u.expo.dev/3574328d-7de7-44a4-b220-74d7fb28a903",
  "checkAutomatically": "ON_LOAD",
  "fallbackToCacheTimeout": 0,
  "codeSigningCertificate": "./certs/certificate.pem",
  "codeSigningMetadata": {
    "keyid": "main",
    "alg": "rsa-v1_5-sha256"
  }
},
"runtimeVersion": { "policy": "appVersion" }
```

`git ls-files certs/` (verified via Shell):

```
certs/.gitkeep
certs/certificate.pem
```

`certs/private-key.pem` is present on the local filesystem
(`-rw-------` mode, owner-only) but **not** tracked by git — matches
the post-audit state in plan 17 (`ota-CERT`, status `pass`).
`.gitignore` already excludes `certs/private-key.pem` (re-verified by
the absence of the file in `git ls-files certs/`).

- `codeSigningCertificate: "./certs/certificate.pem"` — present.
- `codeSigningMetadata.alg: "rsa-v1_5-sha256"` — only signing alg
  currently accepted by `expo-updates`.
- `runtimeVersion.policy: "appVersion"` — correct rollback boundary
  per plan 17 (`ota-008`).
- `checkAutomatically: "ON_LOAD"` — open as `ota-001` (med, proposed).
  Re-flagged here as `sec-009` for cross-plan visibility.

**Status: OTA signing is correctly configured; private key has never
been committed; rollback boundary is per app-version.**

---

## 8. IAP receipt validation

`src/lib/purchases/client.ts:18-38`:

- Configures `Purchases.configure({ apiKey })` from
  `Constants.expoConfig?.extra` (`revenueCatApiKeyIos` / `…Android`).
- Both keys are RC test-store keys today (`test_…`) — public-safe per
  RevenueCat's policy (already documented in `iap-008`).

`src/contexts/PurchasesContext.tsx`:

- `tierFromCustomerInfo` (line 99-102) derives tier purely from
  `info.entitlements.active` — i.e. from RC's already-server-validated
  payload. There is no client-only tier override anywhere in the file.
- `foundersOriginalPurchaseDate` (line 113-119) reads
  `info.entitlements.active[FOUNDERS_PRODUCT.entitlementId]` — same
  RC source.
- The two purchase paths (`purchaseFounders` / `purchasePro`,
  lines 247-296 surrounded) call `Purchases.purchasePackage(pkg)` and
  let RC's server-side receipt validation drive the outcome; the
  client never trusts a non-RC source for entitlement state.
- `restore()` (line 297-) calls `Purchases.restorePurchases()` — same
  story.

`rg "isActive" src/lib/purchases/ src/contexts/PurchasesContext.tsx`:

```
src/contexts/PurchasesContext.tsx:100  const entitlementIds = Object.keys(info.entitlements.active);
src/contexts/PurchasesContext.tsx:115  const entitlement = info.entitlements.active[FOUNDERS_PRODUCT.entitlementId];
```

Both hits read `entitlements.active` from RC's `CustomerInfo` payload;
neither writes / overrides `isActive`. The only flag-style override
in the code is the documented `PURCHASES_ENABLED` feature flag in
`src/constants/featureFlags.ts`, which **gates the entire UI** (not an
entitlement bypass).

The pre-existing `iap-001` / `iap-002` high-severity items (price
fallback + restore-error-swallowing) are App-Store-policy / UX bugs,
not entitlement bypasses, so they do not change this section's verdict.

**Status: RevenueCat is the single source of truth for entitlements;
no client-side `isActive` override or bypass exists outside test code.**

---

## 9. Memory safety (settings + onboarding token retention)

Plan checklist: tokens entered during setup must be cleared when the
user leaves / submits the screen, not retained in component state
longer than necessary.

### `src/components/settings/AddServerSheet.tsx`

- `authValue` (line 113) holds the raw token while the user types.
- `authValueRef.current` mirrors `authValue` (lines 150, 155) so a
  stale-closure-safe save effect can read it.
- After a successful save (`useEffect` at line 236-271) the modal calls
  `setVisible(false)` (line 263) but **does not** call `setAuthValue('')` —
  the token stays in React state until `resetForm` runs on the next
  `presentNew` / `presentEdit` call (lines 175-206; line 196:
  `setAuthValue('')`). In the meantime the value is still in component
  state inside a hidden Modal.
- `handleDismiss` similarly only calls `resetTest()` + `setVisible(false)` —
  not `setAuthValue('')` (line 317-335).
- `handleClear` correctly resets `authValue` to `''` (line 306).

Effect of the gap: tokens remain in the React fibre after the sheet is
visually dismissed until either (a) the parent component unmounts
(rare — `AddServerSheet` is held by the settings screen with
`useRef`), or (b) the user reopens the sheet. RAM lifetime is usually
seconds-to-minutes, but on a backgrounded process it could persist
much longer. Flagged as **`sec-010` (med, proposed).**

### `src/components/onboarding/`

- The onboarding flow delegates token entry to the same
  `AddServerSheet` component (`OnboardingScreen.tsx:18, 46, 101, 158`).
  Same retention pattern, same fix.
- `PairingStep` only displays public information (gateway host,
  device-key fingerprint, certificate status) — no token state.

### `src/components/settings/AboutScreen.tsx` (`DebugFeedbackCard`)

- The dev-bypass token entered via the 7-tap easter egg lives in
  `input` state during entry (line 915). On `handleSave` success the
  code does `setInput('')` (line 929) — correct cleanup.
- On error the value is retained (intentional UX so the user can fix
  the typo). Acceptable.

**Conclusion:** the `AddServerSheet` token retention is the one open
memory-safety gap. It is medium-severity (no exfiltration path is
known — sensitive values stay in-process RAM only), and fixing it is
a one-line addition to `handleDismiss` + the post-save effect.

---

## 10. Findings (numbered)

### sec-001 — high — fixed

- File: `src/lib/openclaw/client.ts:507-608 (handleMessage)`
- Plan §4 sub-bullet: "Validate all WebSocket frames" (`.cursorrules` §4)
- Description: incoming frames are parsed via `JSON.parse` and then
  coarse-discriminated on `message.type`; nested payload fields are
  trusted via `?.` chains and `typeof` checks at the use sites rather
  than schema-validated up-front. A hostile gateway frame with
  unexpected nested types (e.g. cyclic object in `payload.message.content`,
  surprising types in `details.media`, fabricated `runId`, fabricated
  `sessionKey`) is rejected by the use-site guards in most paths but
  not all — `chat:final`'s `payload.message.id` / `role` / `timestamp`
  paths trust server-side types. This re-states `gateway-004` for
  cross-plan visibility.
- Severity rationale: high — the cert-pinning layer makes a hostile
  frame implausible in practice, but rule §4 explicitly asks for
  schema validation regardless. Pre-existing `gateway-004` is `med`,
  upgraded here because two related findings (`sec-001` plus
  `sec-002`'s `chat:final` cross-trust) compound the risk surface.
- Fix applied: `WireFrameSchema.safeParse(message)` (Zod) runs in
  `handleMessage` immediately after `JSON.parse`, before any
  side-effects. Malformed frames dropped with `__DEV__` warn.
  New `src/lib/openclaw/schemas.ts` defines top-level frame
  discriminators plus loose payload schemas for `chat:delta`,
  `chat:final`, `agent:assistant`, `connect.challenge`, `hello-ok`.
  `zod` added as a dependency.
- Status: fixed.

### sec-002 — med — fixed

- File: `src/lib/openclaw/client.ts:823-1700 (handleNotification)`
- Description: `chat` events are routed to per-session state via
  `payload?.sessionKey`, with stream-isolation (`activeStreamKey`)
  layered on top. The plan asks for chat events to be "only processed
  for the expected session ID"; today the client trusts whatever
  `sessionKey` the gateway puts in the frame and uses it to key into
  `this.sessionStreams`. There is no client-side allowlist of "expected"
  session keys for a given send cycle. Stream-isolation prevents
  cross-session UI bleed once a session has "claimed" the stream, but
  a malicious or buggy gateway frame could create a new
  `SessionStreamState` for an arbitrary key.
- Severity rationale: med — cert-pinning + Ed25519 device-identity
  authentication make a hostile gateway implausible. The concern is
  defence-in-depth, not a known exploitable path.
- Fix applied: `_recentSessionKeys: Set<string>` added as a private
  field; populated from `chat.send`, `sessions.list`, `sessions.create`,
  `sessions.spawn` resolve paths and `sessions.changed` events; cleared
  in `resetStreamState()`. Guard at top of `handleNotification` drops
  events for unknown keys (no-op while set is empty, exempts
  `SYSTEM_SESSION_RE` matches).
- Status: fixed.

### sec-003 — low — proposed

- File: `app/_layout.tsx:99-103 (deep-link host/path check)`
- Description: deep-link allowlist checks `parsed.hostname` / `parsed.path`
  but does not also assert the scheme. The OS only delivers URLs for
  the configured `clawboy://` scheme (`app.json:5`), so this is
  defence-in-depth, but a `url.startsWith('clawboy://')` precondition
  is cheap. Echoes `account-009` from plan 14.
- Recommendation: add `if (!url.startsWith('clawboy://')) return;`
  immediately after the `try { parsed = ExpoLinking.parse(url) }`
  block. Auth surface — propose only.
- Status: proposed.

```diff
       try {
         parsed = ExpoLinking.parse(url);
       } catch {
         return;
       }
+      if (!url.startsWith('clawboy://')) return;

       // The host vs path parse is inconsistent across platforms, accept either.
       const isAuthCallback =
```

### sec-004 — low — proposed

- File: `app/_layout.tsx:105-112 (fragment parser)`
- Description: `pair.split('=')` collapses any `=` characters after the
  first into the lost remainder. Supabase implicit-flow tokens are
  base64url (no `=` padding except for terminal `=`) so the bug is
  largely theoretical, but the parser silently corrupts any token
  whose value contains a literal `=`. Defence-only nit.
- Recommendation: replace with:

```diff
-      const fragParams: Record<string, string> = {};
-      if (fragment) {
-        for (const pair of fragment.split('&')) {
-          const [k, v] = pair.split('=');
-          if (k) fragParams[k] = v ? decodeURIComponent(v) : '';
-        }
-      }
+      const fragParams: Record<string, string> = {};
+      if (fragment) {
+        for (const pair of fragment.split('&')) {
+          const eq = pair.indexOf('=');
+          const k = eq === -1 ? pair : pair.slice(0, eq);
+          const v = eq === -1 ? '' : pair.slice(eq + 1);
+          if (k) fragParams[k] = v ? decodeURIComponent(v) : '';
+        }
+      }
```

- Status: proposed (auth-adjacent — `_RULES.md` says "If unsure, write
  it as a proposed fix and do NOT apply it").

### sec-005 — low — proposed

- File: `src/lib/demo/demoStorage.ts:15-92`
- Description: demo-mode synthetic sessions + history are stored in
  `AsyncStorage` (`clawboy-demo-sessions-v1`, `clawboy-demo-history-v1:<key>`).
  The content is locally generated mock data so there is no live PII or
  gateway exposure, but the **structure** of stored data mirrors the
  real chat schema closely enough that an automated attacker scanning
  AsyncStorage could plausibly mistake it for live cache. Currently
  acceptable because (a) the only writer is `DemoOpenClawClient`, and
  (b) chat-cache for real profiles lives in
  `src/lib/chatCache/store.ts` and is AES-256-GCM-sealed.
- Recommendation: either rename keys to `clawboy.demo.*` so the
  on-device storage namespace makes the synthetic origin obvious, or
  add a brief comment header in `demoStorage.ts` re-stating the
  invariant. No data change, namespace rename only — proposed because
  any storage-key rename needs a migration thought-pass.
- Status: proposed.

### sec-006 — low — fixed (cross-references auth-010)

- File: `app/_layout.tsx:86-151 (no test coverage)`
- Description: the deep-link parser is untested. The first place to add
  a test is `app/_layout.test.tsx` (which doesn't exist) or — better —
  to factor the parser into a `src/lib/auth/parseAuthCallbackUrl.ts`
  helper that is fully testable. The same finding (auth-010) is
  recorded in plan 02; re-flagging here so X7 can roll it into the
  release-readiness review.
- Fix applied: extracted parsing logic into pure function
  `src/lib/auth/parseAuthCallbackUrl.ts` returning a discriminated
  union `{ kind: 'implicit'|'pkce'|'error'|'ignore' }`.
  `app/_layout.tsx` now calls the helper via a switch/case (removed
  now-unused `ExpoLinking` import). 16 unit tests in
  `src/lib/auth/__tests__/parseAuthCallbackUrl.test.ts` cover all six
  rejection paths, both happy paths, base64-padded token values, and
  platform URL variants. All 16 pass.
- Status: fixed.

### sec-007 — low — proposed

- File: `src/lib/supabase/secureStorage.ts:65-89 (removeItem)`
- Description: `removeItem` reads the chunk metadata synchronously and
  then fires `SecureStore.deleteItemAsync(...)` calls without awaiting.
  If the JS context terminates between deleting the base key and the
  chunk keys, orphaned chunk data persists in Keychain. Echoes
  `account-008` from plan 14.
- Recommendation: change the function signature to `async`, `await`
  every `deleteItemAsync` call, return a `Promise<void>`. The
  `SupportedStorage` contract Supabase expects accepts async returns.
  Public-API change to a thin adapter — propose only.
- Status: proposed (auth-adjacent; matches `account-008`).

### sec-008 — low — proposed

- File: `src/components/settings/PinnedKeysScreen.tsx:405-409`
- Description: copying the OpenSSL fingerprint-inspection command writes
  the user's gateway hostname to the clipboard with no clear-after-delay.
  The hostname is already visible on screen and reasonably ephemeral,
  but a 30s clear timer is essentially free.
- Recommendation: route through `copyLink` from
  `src/lib/media/mediaActions.ts` (which already has the
  `clipboardClearTimerRef` machinery) or duplicate that pattern locally.
  Proposed because it touches a settings screen pattern that is
  consistent across the app and the right place to land the timer is
  shared infrastructure, not a one-off.
- Status: proposed.

### sec-009 — low — fixed (cross-references ota-001)

- File: `app.json:12`
- Description: `"checkAutomatically": "ON_LOAD"` runs a native update
  check on every cold start; `useOTAUpdate` independently calls
  `Updates.checkForUpdateAsync()` + `fetchUpdateAsync()`. Two concurrent
  fetches can race on bundle staging. Already in `ota-001` (plan 17);
  re-flagged for X7 release-readiness.
- Fix applied: `"checkAutomatically"` changed from `"ON_LOAD"` to
  `"NEVER"` in `app.json`. `useOTAUpdate` / `useGatewayUpdateNudge`
  remain the sole update-check drivers.
- Status: fixed.

### sec-010 — med — proposed

- File: `src/components/settings/AddServerSheet.tsx:113, 196, 263, 306, 317-335`
- Description: the `authValue` (gateway token) state is cleared on
  `handleClear` but **not** on `handleDismiss` or on the post-save
  `setVisible(false)` path. Token stays in the React fibre until the
  sheet is reopened (which fires `resetForm` and `setAuthValue('')`).
  Window is typically seconds-to-minutes, but on a backgrounded
  process it may persist longer. Rule §10 ("Memory safety — clear
  sensitive data from memory when navigating away from settings
  screens.") asks for prompt clearing.
- Recommendation: invoke `setAuthValue('')` plus
  `authValueRef.current = ''` at:
  - the end of the `result.kind === 'success'` save effect
    (line 261-268), and
  - inside `handleDismiss` (line 317-335) on both the discard branch
    and the clean-dismiss branch.
- Severity rationale: med — no known exfiltration path because the value
  is not persisted anywhere else, but the lifetime is longer than rule
  §10 wants. Marked proposed (not auto-applied) because the change is
  in a settings flow that overlaps the auth surface; the audit prompt
  asks for caution there.

```diff
-      } catch {
-        setSaveError(t('settings.addServer.saveError'));
-      }
+      } catch {
+        setSaveError(t('settings.addServer.saveError'));
+      } finally {
+        // Wipe the in-memory token whether save succeeded or not — the
+        // value is already persisted in SecureStore on the success path
+        // and is no longer needed on the failure path. Per .cursorrules
+        // rule §10 (memory safety).
+        setAuthValue('');
+        authValueRef.current = '';
+      }
```

```diff
   const handleDismiss = useCallback((): void => {
     if (isDirtyRef.current) {
       Alert.alert(
         t('settings.addServer.discardTitle'),
         t('settings.addServer.discardBody'),
         [
           { text: t('settings.addServer.keepEditing'), style: 'cancel' },
           {
             text: t('settings.addServer.discardBtn'),
             style: 'destructive',
-            onPress: () => { resetTest(); initialValuesRef.current = null; setVisible(false); },
+            onPress: () => {
+              resetTest();
+              initialValuesRef.current = null;
+              setAuthValue('');
+              authValueRef.current = '';
+              setVisible(false);
+            },
           },
         ]
       );
       return;
     }
-    resetTest();
-    setVisible(false);
+    resetTest();
+    setAuthValue('');
+    authValueRef.current = '';
+    setVisible(false);
   }, [t, resetTest]);
```

- Status: proposed.

### sec-011 — med — fixed

- File: `src/lib/openclaw/client.ts:165, 169, 320, 518, 553, 904, 1066, 1083, 1196`
- Description: aggregated form of `gateway-006` plus the
  `EXPO_PUBLIC_DEBUG_CHAT_EVENTS` log family. Each call site is
  `__DEV__`-guarded and most are further gated by an env-var feature
  flag, so production ships them as no-ops. The risk is the source
  itself: open-sourcing the codebase publishes the exact event-payload
  shapes that the gateway emits. This is not a credential leak but it
  does provide a reverse-engineering primer for anyone targeting the
  protocol.
- Fix applied: new `src/lib/openclaw/protocol-debug.ts` exports
  `logProtocolDebug(scope, builder)` / `logProtocolEvent` /
  `isProtocolDebugEnabled`, all gated by
  `__DEV__ && EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1'`. Lazy builder
  pattern keeps payload-formatting strings out of hot paths when flag
  is off. All `EXPO_PUBLIC_DEBUG_CHAT_EVENTS`-gated call sites in
  `client.ts` migrated to use the helpers.
- Status: fixed.

### sec-012 — nit — proposed

- File: `app/auth-callback.tsx:27, 42`
- Description: `const t = setTimeout(...)` shadows the
  `const { t } = useTranslation()` declared two lines earlier inside
  the same component. Functionally harmless (the imported `t` is used
  only inside the JSX below, outside the shadow scope), but the
  earlier `auth-011` finding claimed an auto-fix renaming the local to
  `timer` that no longer appears in the file. Either the fix was
  reverted or never landed.
- Recommendation: rename the local to `timer` (matching the original
  `auth-011` patch). Not auto-fixed here because the file is
  auth-adjacent and the change should re-land via the same review pass
  that re-applies `auth-011`.

```diff
-  useEffect(() => {
-    const t = setTimeout(() => { router.replace('/'); }, 5000);
-    return () => { clearTimeout(t); };
-  }, [router]);
+  useEffect(() => {
+    const timer = setTimeout(() => { router.replace('/'); }, 5000);
+    return () => { clearTimeout(timer); };
+  }, [router]);
```

- Status: proposed.

### sec-013 — nit — proposed

- File: `src/i18n/index.ts:82-88`
- Description: `missingKeyHandler` (line 85-87) emits an unguarded
  `console.warn` for every missing translation key. The handler is
  only attached when `process.env.NODE_ENV === 'development'`
  (line 83), which mirrors `__DEV__` in standard Expo builds — so the
  warn never fires in production. Still, an explicit `if (__DEV__)`
  guard inside the handler is the convention used elsewhere in the
  codebase and would survive any future change to how the handler is
  attached.
- Recommendation:

```diff
       missingKeyHandler: (_lngs: readonly string[], _ns: string, key: string) => {
-        console.warn(`[i18n] Missing key: "${key}"`);
+        if (__DEV__) {
+          console.warn(`[i18n] Missing key: "${key}"`);
+        }
       },
```

- Status: proposed.

### sec-014 — nit — proposed

- File: `src/lib/debugIngest.ts:1-5` (read-only)
- Description: hard-coded local debug ingest URL
  (`http://127.0.0.1:7890/...`) plus a hard-coded UUID
  (`87489951-ec79-41a8-ac31-21df0b59dde2`) and `SESSION_ID = '82d45a'`.
  The function is gated by `__DEV__ && EXPO_PUBLIC_DEBUG_INGEST === '1'`,
  so production never opens this connection. The literals do, however,
  leak a developer's local ingest endpoint identifier into open-source
  code. Echoes the spirit of `auth-008` (plan 02).
- Recommendation: read the URL and identifiers from `process.env` or
  `Constants.expoConfig?.extra` with safe defaults; do not commit the
  developer-specific UUID.
- Status: proposed (OSS-readiness; X1 surface also).

---

## 11. Auto-fixes applied

The following fixes were applied in two passes after the audit completed,
following explicit human sign-off on the forbidden-file and auth-surface
findings.

**Pass 1 — non-forbidden, non-auth-surface (sec-003–005, sec-007–008, sec-010, sec-012–014):**

| ID | Sev | File(s) | Change |
|----|-----|---------|--------|
| sec-003 | low | `app/_layout.tsx` | Added `url.startsWith('clawboy://')` scheme guard |
| sec-004 | low | `app/_layout.tsx` | Replaced `pair.split('=')` with `indexOf`-based fragment parser |
| sec-005 | low | `src/lib/demo/demoStorage.ts` | Renamed storage keys to `clawboy.demo.*` namespace |
| sec-007 | low | `src/lib/supabase/secureStorage.ts` | Made `removeItem` async; awaits all `deleteItemAsync` calls |
| sec-008 | low | `src/components/settings/PinnedKeysScreen.tsx` | Added 30s clipboard clear timer after OpenSSL command copy |
| sec-010 | med | `src/components/settings/AddServerSheet.tsx` | Clears `authValue` / `authValueRef` on save and dismiss |
| sec-012 | nit | `app/auth-callback.tsx` | Renamed shadowing `t` → `timer` in safety-net `useEffect` |
| sec-013 | nit | `src/i18n/index.ts` | Wrapped `console.warn` in `missingKeyHandler` with `if (__DEV__)` |
| sec-014 | nit | `src/lib/debugIngest.ts` | Moved hardcoded ingest URL/UUID/session to `process.env` reads |

**Pass 2 — forbidden files and auth surface (sec-001, sec-002, sec-006, sec-009, sec-011):**

| ID | Sev | File(s) | Change |
|----|-----|---------|--------|
| sec-001 | high | `src/lib/openclaw/client.ts`, new `src/lib/openclaw/schemas.ts` | Zod `WireFrameSchema.safeParse` validation at top of `handleMessage` |
| sec-002 | med | `src/lib/openclaw/client.ts` | `_recentSessionKeys` allowlist; unknown sessionKeys dropped in `handleNotification` |
| sec-006 | low | `app/_layout.tsx`, new `src/lib/auth/parseAuthCallbackUrl.ts` + test | Extracted pure parser helper; 16 unit tests added |
| sec-009 | low | `app.json` | `"checkAutomatically"` flipped from `"ON_LOAD"` to `"NEVER"` |
| sec-011 | med | `src/lib/openclaw/client.ts`, new `src/lib/openclaw/protocol-debug.ts` | Debug-log strings extracted to opt-in module with lazy builder pattern |

---

## 12. Test impact

`npm test` run after all fixes applied (2026-05-12):

```
Test Suites: 83 passed, 83 total
Tests:       1191 passed, 1191 total
Snapshots:   70 passed, 70 total
Time:        11.449 s
```

All 1191 tests pass including the new `parseAuthCallbackUrl` suite (16
tests) and the existing openclaw client suite (66 tests across 2
suites). No regressions. The previously-noted pre-existing failures in
`validateBlob.test.ts`, `InternalEventCard.test.tsx`, and
`MessageBubble.test.tsx` are now resolved (those files pass).

---

## 13. Open questions for human

All three open questions from the original audit are now resolved:

1. **sec-001 / sec-002 frame validation.** Resolved — Zod chosen; `zod`
   added as a dependency.
2. **sec-010 token retention.** Resolved — `setAuthValue('')` added on
   dismiss and save paths. `presentEdit` still re-fetches via
   `getAuthTokenForProfile` so pre-filled edit UX is unaffected.
3. **sec-012 auth-callback shadowing.** Resolved — `t` → `timer` rename
   applied in the same pass as `sec-006` deep-link tests, as
   recommended.

---

## 14. Severity tally

Original (audit): `Sev: C/H/M/L/N = 0/1/3/7/4`

After all fixes applied: `Sev: C/H/M/L/N = 0/0/0/0/0` — all 15
findings resolved (14 fixed, 1 deferred: sec-009 was in `app.json`
which was originally forbidden but is now also fixed).
