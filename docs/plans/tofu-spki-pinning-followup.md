# TOFU SPKI Pinning — Follow-up Issues

> Status: **In progress.** Issues #1–#11 have been fixed. This doc tracks the remaining findings.
> Last updated: 2026-04-27
> Owner on hand-off: any agent
> Related files: `modules/expo-pinned-websocket/`, `src/hooks/useConnection.ts`, `src/contexts/ConnectionContext.tsx`, `src/components/settings/PinMismatchScreen.tsx`, `src/components/settings/PinnedKeysScreen.tsx`

## Already Fixed

| # | Issue | Fix |
|---|-------|-----|
| 1 | Android `hostnameVerifier { _, _ -> true }` disabled hostname verification | Replaced with `OkHostnameVerifier` |
| 2 | `pin_mismatch` state overwritten by `cert_error` in catch block and `onCertError` listener | Added sticky-state guard to both sites |
| 3 | iOS SPKI hash wrong for non-standard key types (RSA-3072, EC-P521, Ed25519) | Replaced header-table reconstruction with direct ASN.1 DER parsing via `SecCertificateCopyData`; `extractSpkiDer` walks RFC 5280 TBSCertificate fields and returns the SPKI bytes directly — key-type-agnostic and cross-platform portable. Also fail-closed in pinning mode when SPKI extraction fails. |
| 4 | Android fails open when SPKI extraction returns null | Null hash now throws `SSLPeerUnverifiedException` when pins are configured; TOFU mode returns silently. Catch clause narrowed from `Exception` to `NoSuchAlgorithmException`. |

---

## Open Issues (Priority Order)

### High — security correctness ✅ Done

#### ~~Issue 3 — iOS SPKI hash is wrong for non-standard key types~~ ✅ Fixed

**File:** `modules/expo-pinned-websocket/ios/ExpoPinnedWebsocketModule.swift`

**Problem:**

`spkiSha256Hex()` prepends a hardcoded DER header based on key type/size, then SHA-256s the result. This works for RSA-2048, RSA-4096, EC-P256, EC-P384 — but silently produces wrong, non-portable hashes for:

- RSA-3072 → treated as RSA-2048 (wrong header → wrong hash)
- EC-P521 → treated as EC-P256 (wrong header → wrong hash)
- Ed25519 / Ed448 → no header prepended → hash is raw key material, not a real SPKI hash

Since Android's `cert.publicKey.encoded` returns the real SPKI DER directly, an iOS and Android pin for the same cert with a non-standard key type will **never match each other**.

**Root cause:** The SPKI header lookup table is incomplete and has a wrong-but-silent fallback.

**Fix:** Parse the SPKI out of the cert DER directly instead of reconstructing it. `SecCertificateCopyData(cert)` gives full cert DER. Walk the ASN.1 `TBSCertificate.subjectPublicKeyInfo` sequence (two SEQUENCE tags then the BIT STRING), extract the substructure, and SHA-256 it. This is ~30 lines and is key-type-agnostic.

Alternatively: use `SecCertificateCopyKey(cert)` to get the `SecKey`, then `SecKeyCopyExternalRepresentation` + the DER header table — but also add an `else` that returns `nil` (fail-closed) for unknown key types instead of hashing raw key material.

**Immediate safe mitigation (if a full ASN.1 parser is too much right now):** Change the `else { header = [] }` to:

```swift
} else {
  // Unknown key type — cannot produce a portable SPKI hash.
  // Fail closed: returning nil causes the connection to proceed without pinning
  // but also without a false TOFU record.
  return nil
}
```

Then in `urlSession(_:didReceive:completionHandler:)` handle the `nil` case more explicitly.

---

#### ~~Issue 4 — Android fails open when SPKI extraction fails~~ ✅ Fixed

**File:** `modules/expo-pinned-websocket/android/src/main/java/expo/modules/pinnedwebsocket/ExpoPinnedWebsocketModule.kt`

**Problem:**

```kotlin
val spkiHash = spkiSha256Hex(leaf) ?: return   // ← FAIL OPEN
```

If `spkiSha256Hex` returns `null` (because `cert.publicKey.encoded` returned null or `MessageDigest` threw), the function `return`s early and accepts the connection without pin enforcement, even when `allowedSpkiHashes` is non-empty. Security policy: if you can't compute the hash, you can't verify the pin — reject.

Also: catching `Exception` broadly in `spkiSha256Hex` swallows unexpected bugs. `cert.publicKey.encoded` only ever throws `InvalidKeyException` realistically; use a narrower catch.

**Fix:**

```kotlin
override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    defaultTrustManager.checkServerTrusted(chain, authType)

    val leaf = chain[0]
    val spkiHash = spkiSha256Hex(leaf)

    if (spkiHash == null) {
        // Cannot extract SPKI — fail closed when pins are active.
        if (allowedSpkiHashes.isNotEmpty()) {
            throw SSLPeerUnverifiedException("Unable to extract SPKI from leaf cert for pin enforcement")
        }
        return  // TOFU mode: cannot observe, let through silently
    }

    onEvent("onPeerSpki", mapOf("socketId" to socketId, "sha256Hex" to spkiHash))
    if (allowedSpkiHashes.isEmpty()) return
    if (!allowedSpkiHashes.contains(spkiHash)) { /* ... existing ... */ }
}
```

And in `spkiSha256Hex`:

```kotlin
fun spkiSha256Hex(cert: X509Certificate): String? {
    return try {
        val spkiDer = cert.publicKey.encoded ?: return null
        val hash = MessageDigest.getInstance("SHA-256").digest(spkiDer)
        hash.joinToString("") { "%02x".format(it) }
    } catch (e: java.security.NoSuchAlgorithmException) {
        null  // SHA-256 is always available on Android; this shouldn't happen
    }
}
```

---

### Medium — correctness / UX ✅ Done

#### ~~Issue 5 — iOS `wasClean` hardcoded to `true`~~ ✅ Fixed

**File:** `modules/expo-pinned-websocket/ios/ExpoPinnedWebsocketModule.swift`, `didCloseWith` delegate method

**Problem:** Every server-initiated close is reported as `wasClean: true` regardless of the close code. Abnormal closures (1011 server error, 1008 policy violation) incorrectly appear clean.

**Fix:** `closeCode == .normalClosure || closeCode == .goingAway` in `didCloseWith`.

---

#### ~~Issue 6 — Web shim uses `module.exports` inside an ESM file~~ ✅ Fixed

**File:** `modules/expo-pinned-websocket/src/PinnedWebSocket.ts`

**Problem:** The file uses ESM exports at the bottom, but on web it uses `module.exports = ...` mid-file. This relies on Metro's Babel CJS transform and is fragile.

**Fix:** Moved the web guard into `createPinnedWebSocket()`. Removed the top-level `module.exports` block and the eslint-disable comment.

---

#### ~~Issue 7 — `send()` silently drops messages when socket isn't OPEN~~ ✅ Fixed

**File:** `modules/expo-pinned-websocket/src/PinnedWebSocket.ts`

**Problem:** The standard `WebSocket` API throws `InvalidStateError` on `send()` when `readyState !== OPEN`. OpenClawClient may rely on this contract. Silent drops cause hard-to-diagnose RPC timeouts.

**Fix:** Added `__DEV__` `console.warn` in the early-return path of `send()`.

---

#### ~~Issue 8 — `cleanup()` never called when `close()` is called but native never fires `onClose`~~ ✅ Fixed

**File:** `modules/expo-pinned-websocket/src/PinnedWebSocket.ts`

**Problem:** Event subscriptions are only removed in `cleanup()`, which is only called from the `onClose` listener. If the native module crashes or the app force-quits mid-close, the subscriptions never get removed, leaking them for the lifetime of the JS runtime.

**Fix:** `close()` now sets `this.closed = true` and calls `this.cleanup()` before invoking the native `closeSocket`. Late `onClose` events from native side find no listeners and are ignored.

---

#### ~~Issue 9 — iOS `listen()` failure path doesn't close the socket from JS's perspective~~ ✅ Fixed

**File:** `modules/expo-pinned-websocket/ios/ExpoPinnedWebsocketModule.swift`

**Problem:** In `listen()`, a `.failure` result reports `onError` but doesn't also fire `onClose`. If the error is a transport failure that doesn't also trigger `didCompleteWithError`, the JS side sees the socket stuck in OPEN state.

**Fix:** `.failure` path now sets `self.closed = true`, fires `onError` then `onClose` (code 1006, `wasClean: false`), and calls `session?.invalidateAndCancel()`.

---

#### ~~Issue 10 — Approve-new-key can create duplicate pins~~ ✅ Fixed

**Files:** `app/index.tsx`, `src/components/onboarding/OnboardingScreen.tsx`

**Problem:** When the user approves a new key from `PinMismatchScreen` or taps "Trust this certificate key" in the pairing screen, the new pin is appended to the existing list without deduplication. A rapid double-tap or a reconnect race could produce `["aa...", "aa..."]`.

**Fix:** All three call sites now use `const next = current.includes(spki) ? current : [...current, spki]` before calling `updateProfileSecurity`.

---

#### ~~Issue 11 — Pin input rejects hashes with separators or in base64~~ ✅ Fixed

**File:** `src/components/settings/PinnedKeysScreen.tsx`

**Problem:** The manual-add validator `!/^[0-9a-f]{64}$/.test(trimmed)` rejects hashes with colons, spaces, or that are in base64 — all common formats from `openssl x509` and browser devtools.

**Fix:** `handleAddPin` now accepts base64 (converting via `atob`) or colon/space-separated hex (stripping separators) before validating the 64-char hex result. UI label updated to reflect accepted formats.

---

### Low — code quality / maintainability

#### Issue 12 — Module-level mutable globals in `PinnedWebSocket.ts`

**File:** `modules/expo-pinned-websocket/src/PinnedWebSocket.ts`

**Problem:** `_nativeModule`, `_emitter`, and `_nextSocketId` are module-level mutable globals. The native module singleton is defensible (it's a process-scoped singleton), but `_nextSocketId` could be replaced.

**Fix for `_nextSocketId`:** Generate a UUID-based socket ID instead:

```typescript
function getNextSocketId(): number {
  // Use a random 31-bit integer to avoid a module-level counter.
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}
```

Or import `generateUUID` from `@/lib/openclaw/utils` if you want a string ID (requires updating the native interface to accept `string` instead of `Int`).

Add a code comment on `_nativeModule`/`_emitter` explaining *why* this is the exception: the native module is a process-scoped singleton and re-acquiring it on every socket creation is wasteful.

---

#### Issue 13 — Unused imports in the Android module

**File:** `modules/expo-pinned-websocket/android/src/main/java/expo/modules/pinnedwebsocket/ExpoPinnedWebsocketModule.kt`

Now that unused imports have been partially cleaned up, verify none remain. At last check `ModuleDefinitionBuilder` was also unused (the DSL builder is inlined). Run `./gradlew :expo-pinned-websocket:compileDebugKotlin` with `-Xlint:all` or check Android Studio's inspection results.

---

#### Issue 14 — Binary frames silently transcoded to UTF-8

**Files:** both iOS and Android implementations

**Problem:** If the server sends a binary WebSocket frame that isn't valid UTF-8, iOS produces `nil` (silent drop) and Android's `bytes.utf8()` (OkHttp's `ByteString.utf8()`) replaces invalid bytes with replacement characters. The OpenClaw protocol is JSON-text-only so this is unlikely to matter, but it's a silent data corruption path.

**Fix (defensive):** On iOS, return early without firing `onMessage` if the Data-to-UTF8 conversion fails. On Android, use `bytes.string(Charsets.UTF_8)` which also replaces invalids — add a debug log if the byte count doesn't match the string byte count.

---

#### Issue 15 — `WebSocketLike` is duplicated

**Files:** `modules/expo-pinned-websocket/src/PinnedWebSocket.ts` and `src/lib/openclaw/types.ts`

**Problem:** The `WebSocketLike` interface is inlined in `PinnedWebSocket.ts` to avoid a cross-module path dependency. A refactor in one place won't be caught at compile time in the other.

**Options:**
- Add a `@types` comment asserting structural compatibility, or
- Extract to a tiny shared package `packages/types/` with zero deps

Since this is an internal-only module for now, the current approach is acceptable. Just add a test assertion or a `// NOTE: keep in sync with src/lib/openclaw/types.ts` comment.

---

#### Issue 16 — `ConnectionContext` SPKI observer computes two timestamps

**File:** `src/contexts/ConnectionContext.tsx`

**Problem:** `firstSeenAt` is computed twice — once for `updateProfileSecurity` and once for the optimistic `activeProfileRef.current` update. They can differ by microseconds, causing the persisted record and the in-memory ref to disagree.

**Fix (one line):**

```typescript
value.setSpkiObserver((hash) => {
  const profile = activeProfileRef.current;
  if (!profile) return;
  if (profile.security?.firstSeenSpkiSha256) return;
  const ts = Date.now();                                        // compute once
  void updateProfileSecurity(profile.id, {
    firstSeenSpkiSha256: hash,
    firstSeenAt: ts,
  });
  activeProfileRef.current = {
    ...profile,
    security: { ...profile.security, firstSeenSpkiSha256: hash, firstSeenAt: ts },
  };
});
```

---

#### Issue 17 — Add `PinnedWebSocket` unit tests

**File:** new file `modules/expo-pinned-websocket/src/__tests__/PinnedWebSocket.test.ts`

**Problem:** There are no tests for the JS wrapper itself — event routing, socketId multiplexing, subscription cleanup, send-when-closed behaviour.

**Recommended test cases:**

1. Events on socket A don't reach a concurrently open socket B (socketId routing guard).
2. `cleanup()` removes all subscriptions after `onClose` fires.
3. `send()` on a CLOSING/CLOSED socket is a no-op (and ideally logs a warning in dev).
4. `onError` then `onClose` both reach the correct handlers in order.
5. `onPinError` routes to `opts.onPinError` callback.
6. `onPeerSpki` routes to `opts.onPeerSpki` callback.

Mock `requireNativeModule` and `EventEmitter` from `expo-modules-core` — see how `useConnection.pinMismatch.test.ts` mocks `expo-pinned-websocket` at the module level for reference.

---

#### Issue 18 — `pin_mismatch` confirm suffix is theatrical; improve guidance

**File:** `src/components/settings/PinMismatchScreen.tsx`

**Problem:** The 4-char suffix prompt ("Type the last 4 characters") acts as a deliberation gate, not a security check. The hash is visible directly above the input. A socially-engineered user will satisfy it without independent verification.

**Improvement (copy/UX, no logic change needed):**

Add a collapsible "How to verify this on your server" section with the one-liner:

```
openssl s_client -connect <hostname>:443 </dev/null 2>/dev/null | \
  openssl x509 -noout -pubkey | \
  openssl pkey -pubin -outform DER | \
  openssl dgst -sha256 -hex
```

Also show the last 8 chars (not 4) in the confirm prompt — 4 chars is a 1/65536 collision probability, 8 is 1/4.3B.

---

#### Issue 19 — Connection state machine needs a centralized transition guard

**File:** `src/hooks/useConnection.ts`

**Problem:** The "don't overwrite sticky states" guard is now copied in three places: `onReconnectExhausted`, `onCertError`, and the `catch` block. The next added state will require a fourth.

**Planned fix:** Extract a `canTransitionTo(from, to)` helper and use `setConnectionState(prev => canTransitionTo(prev, mapped) ? mapped : prev)` everywhere:

```typescript
function canTransitionTo(from: ConnectionState, to: ConnectionState): boolean {
  // Sticky terminal states require explicit user action to leave.
  // They can only be exited by a fresh connect() (which increments the generation
  // and starts a new runConnect call with status 'connecting').
  if (
    from.status === 'pin_mismatch' ||
    from.status === 'identity_rejected' ||
    from.status === 'pairing_required'
  ) {
    return to.status === 'disconnected' || to.status === 'connecting' || to.status === 'connected';
  }
  return true;
}
```

This dissolves issues #1–#2's guards into a single rule and makes future state additions safer. Worth doing when the next state variant is added.

---

#### Issue 20 — `expo-pinned-websocket/package.json` is missing fields

**File:** `modules/expo-pinned-websocket/package.json`

**Problem:** Missing `"private": true`, `license`, `peerDependencies` for `react-native` and `expo-modules-core`. `"main": "src/index"` points at a `.ts` file which only works inside this Metro-powered monorepo — would break if copied elsewhere.

**Fix (quick):**

```json
{
  "name": "expo-pinned-websocket",
  "version": "1.0.0",
  "private": true,
  "description": "...",
  "main": "src/index",
  "types": "src/index",
  "license": "MIT",
  "files": ["src", "ios", "android", "expo-module.config.json"],
  "peerDependencies": {
    "expo": "*",
    "expo-modules-core": "*",
    "react-native": "*"
  }
}
```

---

## Suggested Execution Order

```
High: ✅ All done
  3 ✅ iOS SPKI hash (correctness; blocks cross-platform pin portability)
  4 ✅ Android fail-open on SPKI extraction error
Medium: ✅ All done
  5 ✅ iOS wasClean
  6 ✅ Web shim ESM cleanup
  7 ✅ send() silent drop
  8 ✅ cleanup() on close()
  9 ✅ iOS listen() failure path
 10 ✅ Duplicate pin guard (3 call sites, trivial)
 11 ✅ Pin input format flexibility
Low:
 16 → ConnectionContext timestamp (1-line fix, do it whenever nearby)
 12 → module-level globals comment / counter fix
 13 → Unused imports
 14 → Binary frame handling
 15 → WebSocketLike duplication note
 17 → PinnedWebSocket unit tests (build whenever adding related tests)
 18 → PinMismatch copy/guidance improvements
 19 → Centralized state transition guard (do when adding next state variant)
 20 → package.json fields
```

Issues 3–4 were fixed together in one PR (PR #1). Issues 5–11 are a logical second PR. Issues 12–20 are housekeeping that can be batched or done opportunistically.
