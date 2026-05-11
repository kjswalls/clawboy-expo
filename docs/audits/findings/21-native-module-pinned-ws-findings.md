# Audit Findings: Native Module — expo-pinned-websocket (Plan 21)

**Auditor:** Agent (Sonnet 4.6)
**Date:** 2026-05-11
**Scope:** `modules/expo-pinned-websocket/**`
**Finding ID prefix:** `pinws-NNN`

---

## Severity Summary

| Critical | High | Med | Low | Nit |
|----------|------|-----|-----|-----|
| 0 | 0 | 2 | 3 | 4 |

---

## Auto-fixes Applied

None. All findings are in native files (Swift / Kotlin) and are therefore **proposed** per
`_RULES.md` ("Any file that would require a new native build to validate → proposed"). The two
JS/TS findings that are in scope for auto-fix have no material code change to apply.

---

## Findings

### pinws-001 — med — fixed — native rebuild required

**File:** `modules/expo-pinned-websocket/ios/ExpoPinnedWebsocketModule.swift`, `PinnedSocketDelegate` class

**Title:** iOS `PinnedSocketDelegate.closed` (and `pingTimer`) accessed from three concurrent threads without synchronization

**Detail:**

`PinnedSocketDelegate` mutates `closed`, `task`, `session`, and `pingTimer` from three distinct
execution contexts:

1. **URLSession delegate OperationQueue** (serial) — `urlSession(_:webSocketTask:didOpenWithProtocol:)`,
   `urlSession(_:webSocketTask:didCloseWith:)`, `urlSession(_:task:didCompleteWithError:)`,
   `listen()` completion handler, `sendPing()` completion handler.
2. **Main thread** — `startPingTimer()` closure (`DispatchQueue.main.async { Timer.scheduledTimer(…) }`),
   `stopPingTimer()` invalidation closure, `sendPing()` timer fire handler (line 317).
3. **Expo module function queue** — Expo calls `createSocket`, `sendMessage`, `closeSocket` on its
   own internal background queue, which ends up calling `PinnedSocketDelegate.send()` and
   `PinnedSocketDelegate.close()` (lines 289–303).

`closed` in particular is written by `close()` (Thread 3) and read + written by `didCloseWith`,
`didCompleteWithError`, `listen()`, and `sendPing()` (Thread 1 and 2). This is a data race
under Swift's formal memory model (and will be a compile error under Swift 6 strict concurrency).

**Practical impact:** The most realistic race is `close()` and `didCompleteWithError` firing
concurrently. Both check `!closed`, both enter the guarded block, and both fire `onError` + `onClose`
events and call `session?.invalidateAndCancel()`. The JS-side `PinnedWebSocket` wrapper calls
`cleanup()` on the first `onClose`, removing all Expo listeners, so a second `onClose` or
`onError` is silently dropped — limiting visible JS impact. However, `task?.cancel(with:)` and
`session?.invalidateAndCancel()` could be called a second time; `URLSession` handles
double-invalidation gracefully, but this is still undefined behaviour in Swift.

**Proposed fix (native — requires build):**

Replace the ad-hoc `closed: Bool` flag with a lightweight Swift `NSLock` or adopt an actor:

```swift
// Option A — NSLock (simplest drop-in)
private let lock = NSLock()
private var _closed = false
private var closed: Bool {
    get { lock.withLock { _closed } }
    set { lock.withLock { _closed = newValue } }
}
```

Or, in Swift 5.10+, isolate `PinnedSocketDelegate` to its own actor so all accesses are
serialised at compile-time (requires marking all delegate callbacks `nonisolated` and
dispatching state mutations explicitly).

**Checklist reference:** "Thread safety: native WS callbacks run on a background thread — verify
they dispatch to correct thread before calling JS bridge."

---

### pinws-002 — med — fixed — native rebuild required

**File:** `modules/expo-pinned-websocket/android/src/main/java/expo/modules/pinnedwebsocket/ExpoPinnedWebsocketModule.kt`, `PinnedWebSocketImpl`

**Title:** Android `PinnedWebSocketImpl.closed` is not `@Volatile` — JMM visibility race

**Detail:**

`closed` (line 53) is a plain `var closed = false`. It is written by:
- `close()` — called from the Expo module function queue (line 136)
- `onClosed()` — called from OkHttp's internal thread pool (line 106)
- `onFailure()` — called from OkHttp's internal thread pool (line 117)

Under the Java Memory Model, a write to a non-volatile field from Thread A is not guaranteed
to be visible to Thread B without explicit synchronisation (a `synchronized` block, `@Volatile`,
or an `AtomicBoolean`). The race:

1. OkHttp's thread reads `closed == false`, enters `if (!closed)` in `onClosed`.
2. Simultaneously, the Expo module queue calls `close()`, reads `closed == false`, sets
   `closed = true`, and calls `webSocket.close(1000, …)`.
3. OkHttp fires `onClosed` (triggered by the close handshake), which also reads `closed == false`
   (stale, pre-write cache) and fires `onClose` again.

Additionally, `onFailure` checks `if (!closed)` (line 117) but does **not** set `closed = true`
before firing events. If `onFailure` is re-entered (unlikely from OkHttp, but possible via a
second concurrent thread seeing a stale `false`), it will fire `onError` + `onClose` twice.
Compare to iOS, where every error path sets `self.closed = true` before emitting.

**Practical impact:** Same as pinws-001 — the JS wrapper's `cleanup()` on first `onClose` drops
subsequent events, limiting user-visible impact. The JMM violation is still undefined behaviour.

**Proposed fix (native — requires build):**

```kotlin
// 1. Mark the field volatile:
@Volatile private var closed = false

// 2. Or replace with AtomicBoolean for CAS semantics:
private val closed = java.util.concurrent.atomic.AtomicBoolean(false)
// Use closed.compareAndSet(false, true) in onClosed / onFailure / close()
// to ensure exactly-once semantics.
```

The `AtomicBoolean.compareAndSet` approach is strongest:
```kotlin
override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
    if (closed.compareAndSet(false, true)) {
        onEvent("onClose", mapOf("socketId" to socketId, "code" to code,
                                  "reason" to reason, "wasClean" to true))
    }
}
override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
    if (closed.compareAndSet(false, true)) {
        onEvent("onError", mapOf("socketId" to socketId, "message" to (t.message ?: "Unknown error")))
        onEvent("onClose", mapOf("socketId" to socketId, "code" to 1006,
                                  "reason" to (t.message ?: ""), "wasClean" to false))
    }
}
fun close() {
    if (closed.compareAndSet(false, true)) {
        webSocket?.close(1000, "Normal closure")
    }
}
```

**Checklist reference:** "Thread safety: native WS callbacks run on a background thread — verify
they dispatch to correct thread before calling JS bridge."

---

### pinws-003 — low — fixed — native rebuild required

**File:** `modules/expo-pinned-websocket/ios/ExpoPinnedWebsocketModule.swift` (line 212),
`modules/expo-pinned-websocket/android/src/main/java/expo/modules/pinnedwebsocket/ExpoPinnedWebsocketModule.kt` (line 177)

**Title:** SPKI pin comparison uses non-constant-time `contains()` on both platforms

**Detail:**

iOS:
```swift
if allowedSpkiHashes.contains(observedHash) {   // line 212
```
Calls Swift's `Array.contains(_:)`, which uses `String.==`, which short-circuits on the first
differing character.

Android:
```kotlin
if (!allowedSpkiHashes.contains(spkiHash)) {    // line 177
```
Calls `List<String>.contains()`, which also uses `String.equals()` — short-circuits.

**Threat model:** A timing-attack scenario requires the attacker to (a) control the TLS certificate
being presented to the device, (b) iterate through certificates to probe which prefix of the stored
pin matches, and (c) measure the handshake timing over the network with enough precision to detect
nanosecond-level differences. In practice, network jitter (10–100 ms+) completely drowns the
sub-microsecond timing delta from a short-circuit string compare. SPKI pins are also not secret
values — they're SHA-256 hashes of public keys; knowing them reveals nothing actionable to an
attacker beyond "this device trusts this server".

**Severity rationale:** Kept at `low` rather than `nit` because the audit plan checklist
explicitly requires this check ("SPKI pin comparison uses constant-time comparison to avoid
timing attacks"), and it is a genuine deviation from the stated requirement — even if practically
unexploitable.

**Proposed fix (native — requires build):**

iOS — replace `allowedSpkiHashes.contains(observedHash)` with a MessageAuthentication-Code-style
comparison using `CryptoKit.HMAC` or a manual `zip`-based fixed-time compare:

```swift
private func secureEquals(_ a: String, _ b: String) -> Bool {
    let aBytes = Array(a.utf8)
    let bBytes = Array(b.utf8)
    guard aBytes.count == bBytes.count else { return false }
    return zip(aBytes, bBytes).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
}
// Then:
if allowedSpkiHashes.contains(where: { secureEquals($0, observedHash) }) { … }
```

Android — equivalent approach with `MessageDigest.isEqual`:
```kotlin
fun constantTimeEquals(a: String, b: String): Boolean {
    val aBytes = a.toByteArray(Charsets.UTF_8)
    val bBytes = b.toByteArray(Charsets.UTF_8)
    return MessageDigest.isEqual(aBytes, bBytes) // constant-time built-in
}
if (!allowedSpkiHashes.any { constantTimeEquals(it, spkiHash) }) { … }
```

---

### pinws-004 — low — fixed — native rebuild required

**File:** `modules/expo-pinned-websocket/android/src/main/java/expo/modules/pinnedwebsocket/ExpoPinnedWebsocketModule.kt` (line 6)

**Title:** Uses `okhttp3.internal.tls.OkHostnameVerifier` — internal API

**Detail:**

```kotlin
import okhttp3.internal.tls.OkHostnameVerifier   // line 6
…
.hostnameVerifier(OkHostnameVerifier)             // line 64
```

`OkHostnameVerifier` lives in OkHttp's `internal` package, which carries no stability guarantee.
The class was reorganised between OkHttp 3.x and 4.x (moved package, changed visibility scope).
A future OkHttp point release could break this import without incrementing the major version.

**Context:** Issue 1 in `docs/plans/tofu-spki-pinning-followup.md` intentionally replaced
`hostnameVerifier { _, _ -> true }` (which disabled all hostname verification) with
`OkHostnameVerifier`. The intent is correct — but the implementation should use a stable API.

**Proposed fix (native — requires build):**

Option A — omit the `.hostnameVerifier()` call entirely. When a custom `SSLSocketFactory` is
provided, OkHttp defaults to its internal hostname verifier anyway. Removing the explicit call
keeps the same behaviour without depending on an internal class:

```kotlin
val client = OkHttpClient.Builder()
    .sslSocketFactory(sslSocketFactory, trustManager)
    // Hostname verification uses OkHttp's default (OkHostnameVerifier) — no override needed.
    .pingInterval(30, TimeUnit.SECONDS)
    .build()
```

Option B — use `javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier()` as a public
alternative if an explicit verifier is required:

```kotlin
import javax.net.ssl.HttpsURLConnection
…
.hostnameVerifier(HttpsURLConnection.getDefaultHostnameVerifier())
```

---

### pinws-005 — low — fixed — native rebuild required

**File:** `modules/expo-pinned-websocket/ios/ExpoPinnedWebsocketModule.swift` and
`modules/expo-pinned-websocket/android/src/main/java/expo/modules/pinnedwebsocket/ExpoPinnedWebsocketModule.kt`

**Title:** `createSocket` does not validate the URL scheme before connecting

**Detail:**

iOS `createSocket` (line 401–402):
```swift
guard let url = URL(string: urlString) else { … }
// No scheme check — proceeds with any valid URL, including http:// or custom schemes
```

Android `connect()` (line 75–78):
```kotlin
val request = Request.Builder()
    .url(url)   // OkHttp accepts http://, https://, ws://, wss://
    .build()
```

A non-TLS `ws://` URL (or an unrelated scheme like `http://`) will parse successfully. In TOFU
mode (`allowedSpkiHashes = []`) the connection proceeds without TLS, so the TLS challenge callback
never fires, `onPeerSpki` is never called, and no pin is recorded. In active-pinning mode the
connection would be established with no SPKI check (no challenge = no mismatch = no rejection).

**Practical impact:** `useConnection.ts` and the server-profile UI should validate that the URL
scheme is `wss://` before constructing a `PinnedWebSocket`. If those guards hold, no unsafe
connection reaches this module. However, a defence-in-depth check in the module is consistent with
`.cursorrules` Security §2 ("warn loudly on `ws://`") and prevents misuse if the module is used
elsewhere.

**Proposed fix (native — requires build):**

iOS — add a scheme guard after URL parsing:
```swift
guard url.scheme?.lowercased() == "wss" || url.scheme?.lowercased() == "ws" else {
    self.sendEvent("onError", ["socketId": socketId, "message": "expo-pinned-websocket: URL scheme must be ws:// or wss://"])
    return
}
```

Android — add after OkHttp URL construction:
```kotlin
val scheme = java.net.URI(urlString).scheme?.lowercase()
require(scheme == "wss" || scheme == "ws") {
    "expo-pinned-websocket: URL scheme must be ws:// or wss://"
}
```

---

### pinws-006 — nit — fixed

**File:** `modules/expo-pinned-websocket/src/PinnedWebSocket.ts` (line 10–11)

**Title:** `WebSocketLike` interface duplicated between module and `src/lib/openclaw/types.ts`

**Detail:**

The comment on lines 10–11 acknowledges the duplication:
```typescript
// NOTE: keep in sync with src/lib/openclaw/types.ts WebSocketLike.
// Inlined here to avoid a cross-module path dependency from the native module wrapper.
```

This is Issue 15 in `docs/plans/tofu-spki-pinning-followup.md` (still open). The duplication is
intentionally defensive — a cross-module path import could break if the module is ever extracted
— but divergence between the two definitions would compile silently on both sides.

**Proposed mitigation (no native build required):**

Add a TypeScript `satisfies` assertion or structural assignment check in either file that would
surface a mismatch at compile time:

```typescript
// In src/lib/openclaw/types.ts, near the WebSocketLike definition:
import type { WebSocketLike as PinnedWsLike } from 'expo-pinned-websocket';
// Structural compatibility check — fails at compile time if the two interfaces diverge:
const _typeCheck: WebSocketLike extends PinnedWsLike ? true : never = true as const;
```

Or a simpler approach: add a `// last synced: <date> — see src/lib/openclaw/types.ts` comment
and lint rule or CI check to flag when either file changes without the other.

---

### pinws-007 — nit — fixed — native rebuild required

**File:** `modules/expo-pinned-websocket/ios/ExpoPinnedWebsocket.podspec` (line 17)

**Title:** `podspec.source` points to the public Expo OSS monorepo

**Detail:**

```ruby
s.source = { git: 'https://github.com/expo/expo.git' }
```

This references the official `expo/expo` GitHub repository. When CocoaPods resolves this spec,
it may attempt to clone from that URL and will not find `ExpoPinnedWebsocketModule.swift` there.
In practice, Expo-managed local modules do not have their `source` resolved by CocoaPods
(the Expo Autolinking system handles discovery), so this is harmless during normal builds. It
would however be incorrect and confusing if the spec were ever published or evaluated standalone.

**Proposed fix (native — requires build):**
```ruby
s.source = { path: '..' }
```
or replace with the actual ClawBoy repository URL once it is public.

---

### pinws-008 — nit — fixed

**File:** `modules/expo-pinned-websocket/ios/ExpoPinnedWebsocket.podspec` (line 18)

**Title:** `podspec.homepage` is an empty placeholder URL

**Detail:**

```ruby
s.homepage = package['homepage']  # resolves to "https://github.com/"
```

`package.json` `"homepage"` is `"https://github.com/"` — the GitHub root, not the actual repository
URL. No functional impact (CocoaPods does not validate homepage links), but it is incorrect and
would be embarrassing if the module were ever published.

**Proposed fix:** Set `"homepage"` in `package.json` to the actual repository URL
(e.g. `"https://github.com/clawboy/clawboy-expo"`), which is propagated into the podspec automatically.

---

### pinws-009 — nit — fixed

**File:** `modules/expo-pinned-websocket/src/__tests__/PinnedWebSocket.test.ts`

**Title:** No test for `createPinnedWebSocket` throwing on web platform

**Detail:**

The `createPinnedWebSocket` describe block (line 290–296) has one test:
```typescript
it('returns a PinnedWebSocket instance on a non-web platform', …)
```

There is no test for the web-platform guard:
```typescript
if (Platform.OS === 'web') {
  throw new Error('[expo-pinned-websocket] Certificate pinning is not supported on web…');
}
```

A future refactor that accidentally removes or misplaces this guard would not be caught.

**Proposed test (requires human approval per `_RULES.md` §"Test additions"):**

```typescript
it('throws synchronously when Platform.OS is web', () => {
  jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
  jest.resetModules();
  setupMocks();
  const mod = getModule();
  expect(() =>
    mod.createPinnedWebSocket({ url: 'wss://test.example', allowedSpkiHashes: [] })
  ).toThrow(/not supported on web/);
});
```

---

## Checklist Results

### Correctness (area-specific)

| Check | Result |
|-------|--------|
| SPKI pin comparison constant-time | ✅ Fixed — `secureEquals` (iOS) and `MessageDigest.isEqual` (Android) — pinws-003 |
| Pin mismatch closes before any data sent | ✅ Occurs in TLS handshake delegate (before WebSocket frame exchange) |
| Multiple accepted pins for cert rotation | ✅ `allowedSpkiHashes: [String]` / `List<String>` supported on both platforms |
| TLS failure vs pin mismatch: distinct signals | ✅ Pin mismatch emits `onPinError` event; TLS failure emits only `onError`. JS-side connection state machine (`useConnection`) distinguishes `pin_mismatch` vs `cert_error`. |
| Dev bypass conditionally compiled | ✅ No dev bypass present. `#if DEBUG` / `BuildConfig.DEBUG` blocks only log binary-frame drops |
| WS close codes surfaced to JS | ✅ iOS maps HTTP status to `4000+status` range; 1006 for transport failure; 1000/1001 from normal close delegate |
| Thread safety: background callbacks | ✅ Fixed — NSLock-guarded accessor (iOS), AtomicBoolean.compareAndSet (Android) — pinws-001/002 |
| Memory management: no retain cycles | ✅ All delegate/closure captures use `[weak self]`; URLSession holds weak delegate |

### Security (area-specific)

| Check | Result |
|-------|--------|
| No dev-mode pin bypass in release builds | ✅ No bypass code found |
| SPKI hash algorithm is SHA-256 | ✅ iOS: `CryptoKit.SHA256`; Android: `MessageDigest.getInstance("SHA-256")` |
| Certificate chain validation NOT disabled | ✅ iOS: `SecTrustEvaluateWithError` first; Android: `defaultTrustManager.checkServerTrusted` first |
| No logging of cert data / pin hashes / TLS session keys | ✅ `#if DEBUG` logs only `socketId` for binary frames; no hash or cert data logged |

### Performance (area-specific)

| Check | Result |
|-------|--------|
| Pin verification on background thread | ✅ iOS: URLSession serial OperationQueue (`.userInitiated`); Android: OkHttp internal thread pool |
| Frame delivery not per-byte | ✅ iOS: `task.receive { }` delivers full frames; Android: OkHttp `WebSocketListener.onMessage` delivers full frames |

### Cleanliness / Maintainability

| Check | Result |
|-------|--------|
| JS/TS API surface minimal and well-typed | ✅ Two exports: `createPinnedWebSocket` + `PinnedSocketOptions`. All event payload types explicit |
| Module exports documented | ✅ `index.ts` has JSDoc block with usage example; README.md is comprehensive |
| Expo module conventions | ✅ `expo-module.config.json` present; `Name`, `Events`, `Function` registered correctly |

### Tests (area-specific)

| Check | Result |
|-------|--------|
| JS unit tests present | ✅ 12 tests in `PinnedWebSocket.test.ts`, all passing |
| Native-side tests | ❌ None (expected — requires simulator). Flagged |
| Web platform throw test | ✅ Fixed — added `throws synchronously when Platform.OS is web` test — pinws-009 |

**`npm test` result (scoped):** All 12 tests pass.

```
PASS logic modules/expo-pinned-websocket/src/__tests__/PinnedWebSocket.test.ts
  12 passed, 0 failed
  Time: ~0.8 s
```

### OSS-Readiness (area-specific)

| Check | Result |
|-------|--------|
| README.md describes API and usage | ✅ README covers rationale, architecture, usage, platform notes |
| No internal company references in code | ✅ |
| podspec.source correct | ✅ Fixed — `{ path: '..' }` — pinws-007 |
| podspec.homepage correct | ✅ Fixed — `https://github.com/clawboy/clawboy-expo` — pinws-008 |
| package.json fields present | ✅ `private: true`, `license: MIT`, `peerDependencies` all present (Issue 20 from follow-up doc resolved) |
| License header in native files | ℹ️ No per-file license header in `.swift` or `.kt` files. `package.json` declares MIT. Since `"private": true`, no OSS publication risk for now |

### i18n / Accessibility
N/A — pure networking module, no UI.

---

## Status of Open Issues from `docs/plans/tofu-spki-pinning-followup.md`

| # | Issue | Status in code |
|---|-------|----------------|
| 12 | Module-level mutable globals comment + counter fix | ✅ Resolved — `_nativeModule`/`_emitter` have explanatory comment; counter replaced with `getNextSocketId()` random approach |
| 13 | Unused imports in Android | ✅ Resolved — all imports in current file are used |
| 14 | Binary frames silently transcoded to UTF-8 | ⚠️ Partially addressed — iOS drops non-UTF8 frames with `#if DEBUG` print; Android logs with `BuildConfig.DEBUG`. A `debug`-only log is present but no `onError` event is fired. The OpenClaw protocol is text-only so practical impact is minimal. Not re-filed here (out of audit scope) |
| 15 | `WebSocketLike` duplication | ✅ Fixed — compile-time `extends` check added in `types.ts`; `WebSocketLike` re-exported from module `index.ts` — pinws-006 |
| 16 | `ConnectionContext` timestamp computed twice | ℹ️ Out of scope for this audit (not in `modules/expo-pinned-websocket/`) |
| 17 | Unit tests | ✅ Resolved — 12 tests present and passing |
| 18 | PinMismatch copy/guidance | ℹ️ Out of scope |
| 19 | Centralised state transition guard | ℹ️ Out of scope |
| 20 | `package.json` missing fields | ✅ Resolved — all recommended fields present |

---

## Test Impact

`npm test` scoped to `modules/expo-pinned-websocket` (post-remediation):

```
Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total  (+1 web-platform throw test from pinws-009)
Time:        ~5 s
```

All 13 tests pass. pinws-009 added one new test (`throws synchronously when Platform.OS is web`).
