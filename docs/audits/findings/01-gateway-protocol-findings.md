---
plan: 01-gateway-protocol
model: claude-opus-4
date: 2026-05-09
agent: Claude (claude-opus-4)
status: done
---

# Gateway Protocol Findings

Date: 2026-05-09
Agent: claude-opus-4
Status: done

## Summary

The OpenClaw protocol layer (`src/lib/openclaw/*` plus `modules/expo-pinned-websocket/`) is in
overall good shape. The pure-logic modules — utilities, session/agent/skill
APIs, conventions installer, interactive directive parser — are well-typed,
defensively coded, and have meaningful test coverage. The hot path
(`client.ts`) implements the documented streaming-isolation, rejection-on-close,
and reconnect-with-jitter patterns and has a comprehensive test suite. There
are no critical security defects, no plaintext credential logging, no hard-coded
hostnames, and no `dangerouslySetInnerHTML`-equivalent risks.

The two material gaps are both forbidden-to-edit and so are recorded as
proposed work for human review: (1) the documented `_connectGeneration`
counter from `.cursorrules` is not implemented (`client.ts` relies solely on
`pendingRequests` rejection on close, which leaves non-RPC async paths
unguarded); and (2) `modules/expo-pinned-websocket/src/PinnedWebSocket.ts`
no longer typechecks against the installed `expo-modules-core` (the
`EventEmitter` API moved to a generic typed-events form). The latter is
covered in detail by plan 21.

A handful of low-severity items are worth surfacing: `client.ts` logs the
gateway URL on every connect attempt (privacy, not credential leak); `_call`
does not store its timeout id (timer wakes after request resolves);
`agents.ts` exports `getConfig` which is a near-duplicate of
`config.ts`'s `getServerConfig`; and `canvas.ts` exports
`refreshCanvasCapability`/`buildCanvasUrl` that no other module imports.

One safe auto-fix was applied (unused `err` binding in `agents.ts`).

## Severity Counts
- critical: 0
- high: 1
- med: 4
- low: 8
- nit: 4

## Findings

| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| gateway-001 | high | `modules/expo-pinned-websocket/src/PinnedWebSocket.ts:9,55,61,101+` | `EventEmitter` import surface from `expo-modules-core` no longer matches: `Subscription` is not exported, `EventEmitter` is now a generic class with typed events, and `addListener` is no longer present on the runtime constructor used here. `tsc --noEmit -p .` reports 16 errors in this file. The native module still works at runtime because the JS `Listener` payload contract is unchanged, but the wrapper is no longer type-safe and would be silently broken by any future signature change in `expo-modules-core`. | Migrate to the typed-events form: `new EventEmitter<MyEvents>()` plus `emitter.addListener<...>(...)`. Out of scope to fix here — flagged for plan 21 (`21-native-module-pinned-ws.md`). | proposed |
| gateway-002 | med | `src/lib/openclaw/client.ts` (whole file) | The documented `_connectGeneration` counter pattern from `.cursorrules` ("Patterns to steal from ClawControl") is not implemented. `OpenClawClient` instead relies on `rejectPendingRequests('Connection lost')` in `onclose` (line 247) to invalidate stale RPCs. This works for `_call`-based RPCs but does **not** protect non-RPC async paths: `performHandshake` reads `this.deviceIdentity` and calls `signChallenge` (line 442) — if the connection is dropped and a new one opened mid-signing, the late `this.ws?.send(...)` becomes a no-op (good), but there is no symmetrical guard for any other async work added later. The plan-specific checklist explicitly calls for "every async op checks it before acting"; that property is currently coupled to `this.ws` instance identity, not a generation counter. | Add a `private _connectGeneration` integer that is incremented at the top of every `connect()` call. Snapshot it at the start of every async op (handshake, health check, watchdogs, late media decode in `onmessage`) and bail when the snapshot differs from the live counter. Forbidden file — propose only. | proposed |
| gateway-003 | med | `src/lib/openclaw/client.ts:145-296 (connect)` | `connect()` does not tear down a prior socket or cancel a pending `reconnectTimer` before opening a new one. If `connect()` is called externally while a reconnect is in flight (or while `this.ws` is still `OPEN`/`CONNECTING`), the previous socket is orphaned with all four `ws.on*` handlers still attached and a second `WebSocket` is created. Both will then race for the next gateway response. `disconnect()` does this correctly; `connect()` does not mirror it. | Make `connect()` idempotent: clear `this.reconnectTimer`, null-out and `close()` `this.ws` (with handlers nulled, as `disconnect()` does), then proceed. Forbidden file — propose only. | proposed |
| gateway-004 | med | `src/lib/openclaw/client.ts:508-603 (handleMessage)` | Incoming WebSocket frames are processed without schema validation. The code does coarse `message.type === 'event' \| 'res'` discrimination and casts to `EventFrame`/`ResponseFrame`, then dereferences nested fields with `?.` and `typeof` checks at use sites. A malformed or hostile gateway frame (e.g. `payload.message.content` set to a deeply nested cyclic object, or `details.media` with surprising types) is handled defensively in many places but not all (e.g. `payload.message.id`/`role`/`timestamp` paths in the `chat:final` branch trust the server's types). Per `.cursorrules` Security §4 ("Validate all WebSocket frames... a compromised connection shouldn't be able to execute arbitrary behavior"). | Introduce a small Zod-or-hand-rolled validator for the top-level frame shapes (`req`/`res`/`event`) and for the high-impact event payloads (`chat:final`, `agent:assistant`, `agent:lifecycle`, `connect.challenge`). Reject unknown frames with a logged warning. Forbidden file — propose only; would also pull in a new dep if Zod-based, so requires human review. | proposed |
| gateway-005 | med | `src/lib/openclaw/agents.ts:138-147` & `src/lib/openclaw/config.ts:9-14` | `agents.ts` defines and exports `getConfig(call)` which is a byte-for-byte duplicate of `config.ts`'s `getServerConfig(call)`. `getConfig` has no external importer (verified with `rg "import.*\bgetConfig\b"`). Two copies of the same RPC wrapper drift over time. Per the area-specific checklist: "`types.ts` is the single source of truth ... no inline type duplication" — same principle. | Replace `getConfig` callers inside `agents.ts` (lines 165, 225) with an import of `getServerConfig` from `./config`, and either delete `getConfig` (public-API change) or keep it as a one-line re-export alias. Public-export removal needs human sign-off, so propose. | proposed |
| gateway-006 | low | `src/lib/openclaw/client.ts:165, 169, 320` | `console.log(\`[OpenClaw] connect() → ${this.url}\`)` and the matching socket-open / reconnect logs print the full gateway URL on every connection attempt. The URL itself is not a credential, but for users on Tailscale magic-DNS or a private VPS, it identifies the user's home server in any captured device-side log (Crashlytics, Sentry, Expo dev log share). No token leakage. | Drop the URL from these `console.log` calls (or guard behind `__DEV__`). Forbidden file — propose only. | proposed |
| gateway-007 | low | `src/lib/openclaw/client.ts:476-506 (_call)` | The 30 s request timeout (line 499) is created with a bare `setTimeout(...)` whose handle is not retained. When the response resolves before the timeout, the timer continues running until it fires and finds an empty `pendingRequests` (a no-op `if`). For a chatty session this leaks dozens of unreferenced timer handles per minute, all kept alive by the React Native event loop. Not a memory bomb but unhygienic. | Store the timer handle in a local and `clearTimeout(handle)` inside `pending.resolve`/`pending.reject`. Forbidden file — propose only. | proposed |
| gateway-008 | low | `src/lib/openclaw/client.ts:499-504` | The same `setTimeout` block rejects with `Request timeout: ${method}`, but it does not differentiate between "server slow" (likely a real RPC issue) and "stream timeout for chat.send" (separate UX). The response watchdog described in `.cursorrules` ("timer started on send, cleared on first chunk") **is not in this file**. It is implemented in `src/hooks/useChat.ts` instead (verified `rg watchdog src/hooks/useChat.ts`). That layering is fine — the protocol layer owns the RPC timeout, the hook layer owns the streaming watchdog — but it is worth documenting so plan 02/04 reviewers know to inspect both. | Document this responsibility split in a short comment at `_call` and at the top of the streaming branch. No code change needed. | proposed |
| gateway-009 | low | `src/lib/openclaw/client.ts:600-602 (handleMessage)` | The outermost `try { JSON.parse(data) ... } catch { /* Failed to parse message */ }` swallows parse errors silently. If a gateway briefly sends junk (e.g. partial frame, non-UTF8), neither dev nor production gets any signal. | Log the first parse failure per connection at `__DEV__` with a small reservoir cap so we don't flood. Forbidden file — propose only. | proposed |
| gateway-010 | low | `modules/expo-pinned-websocket/src/PinnedWebSocket.ts:54-64` | `_nativeModule` and `_emitter` are module-level mutable globals. The comment on line 52 documents the intent ("native module is process-scoped — re-acquiring it on every socket construction is wasteful and triggers an unnecessary bridge round-trip"), and the test suite resets them via `jest.resetModules()`. This is technically a violation of `.cursorrules` rule "No module-level mutable globals (all timers/caches/counters live in hooks/refs)" but is justified for a process-scoped native bridge handle. | Acceptable as-is. Optionally hide behind a single `getNative()` memoisation helper rather than two module-level `let`s, but functional behaviour is unchanged. Forbidden file (modules/) — propose only. | proposed |
| gateway-011 | low | `src/lib/openclaw/canvas.ts:9-19` | Both exports (`refreshCanvasCapability`, `buildCanvasUrl`) are reachable through `index.ts` re-exports but are not imported from anywhere outside `canvas.ts` itself. The header comment says "Currently not needed for operator connections … for future use". Dead-code-by-design. | Either drop the exports / file, or move to `canvas.unused.ts` and stop re-exporting from `index.ts`. Public-API change → propose. | proposed |
| gateway-012 | low | `src/lib/openclaw/sessions.ts:84-98 (createSession)` | `createSession` is declared `async` but contains no `await` and never throws. It generates a session key client-side (correct for the v3 lazy-create model). The `async` modifier creates a needless microtask hop on every "new chat" tap. | Drop `async`, return `Session` directly, and let callers `await Promise.resolve(...)` if they need a Promise shape. Public-API change (return type goes from `Promise<Session>` to `Session`) → propose. | proposed |
| gateway-013 | low | `src/lib/openclaw/skills.ts:39-54 (installHubSkill)` | The slug regex `/^[a-zA-Z0-9_-]+$/` correctly prevents shell injection. However, the function then sends a **chat message** that asks the agent to run `clawhub install <slug> --force`, which depends on the agent's exec-tool approval policy to actually execute. There is no fallback if exec is denied, and `--force` is hard-coded (no opt-out). A user has no way to install a skill via this client without granting the agent unrestricted exec. | At minimum, document the security model in a JSDoc above the function. Long-term, route through a real `skills.installHub` RPC if/when the gateway adds one. | proposed |
| gateway-014 | low | `src/lib/openclaw/utils.ts:702-711 (generateUUID)` | The `crypto.randomUUID()` happy path is fine. The fallback uses `Math.random()` to produce a v4-shaped string. None of the consumers (`idempotencyKey` in `chat.sendMessage`, session key suffixes in `sessions.createSession`) are security-critical, but the fallback gives the false impression of cryptographic strength because of the `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` template. | Add a short comment noting the fallback is **not** cryptographically secure and is only used when `crypto.randomUUID` is unavailable (rare under Hermes / RN modern). Optional: prefer `expo-crypto` (already a dep) when available. | proposed |
| gateway-015 | low | `src/lib/openclaw/client.ts:357-394 (startHealthCheck)` | The health check sends `skills.status` as a liveness probe. That is a real RPC with non-trivial server cost (loads skill metadata, checks requirements). It runs every 15 s if `lastMessageAt` is stale. A cheaper choice would be `health` or `status` (both documented in `.cursorrules` MVP RPC list). | Switch to `health` (zero-payload no-op). Forbidden file — propose only. | proposed |
| gateway-016 | nit | `src/lib/openclaw/agents.ts:97` | `} catch (err) { return false }` — `err` was unused. Replaced with bare `catch` per allowed auto-fix rule "Removing dead code: unused variables". | Auto-fixed. | fixed |
| gateway-017 | nit | `src/lib/openclaw/types.ts:217, 224, 228, 235, 259, 264-267` | Protocol frame types use `any` for `params`, `payload`, `error.details` and `EventFrame.payload`, plus event handler `ev` parameters. Tightening these to `unknown` would be more correct (force type narrowing at use sites) but is a public-API change that ripples through `client.ts` and every domain module. | Tighten to `unknown` (or `Record<string, unknown>`) and add narrowing at use sites in a follow-up. Public-API change → propose. | proposed |
| gateway-018 | nit | `src/lib/openclaw/sessions.ts:59` & `chat.ts:58` | Random IDs used as fallback message IDs and session IDs use `Math.random()` (`session-${Math.random()}`, `history-${Math.random()}`, `htc-${Math.random().toString(36).slice(2,8)}`). For history dedup these must be unique within a session — a 32-bit `Math.random()` collision is improbable but possible. | Replace with `generateUUID()` from `./utils` for any ID that must be unique across the session lifetime. | proposed |
| gateway-019 | nit | `src/lib/__tests__/` (test gaps) | The existing `openclaw-client.test.ts` (1156 lines) covers stream isolation, activeStreamKey, finalized guard, lifecycle-end synthesis, document routing and reset semantics very well. **Gaps**: there is no test for the documented `connect.challenge → signChallenge → connect` flow (the mock WebSocket handshake delivers the challenge but the client signs without a real Ed25519 keypair, so the signature path is not exercised); no test for handshake `NOT_PAIRED` error → `pairingRequired` event; no test for `deviceIdentityStale` event; no test for the reconnect backoff (e.g. counting attempts and observing exponential delay); no test for the tick watchdog (`tickWatchTimer`). All four are explicitly called out in the area checklist. | Add focused unit tests in a follow-up (with `jest.useFakeTimers` for reconnect / tick). Plan 02 (`02-auth-pairing.md`) is a better home for the challenge/pairing/stale-identity tests. Plan does not allow large new test suites — propose. | proposed |

## Auto-Fixes Applied

- gateway-016 (nit): removed unused `err` parameter in the bare `catch` on `setAgentFile` in `src/lib/openclaw/agents.ts:97` — pure cleanup, no behaviour change.

## Concern-checklist coverage

The standard checklist plus area-specific bullets, walked top-to-bottom:

### 1. Correctness
- Documented intent vs. behaviour: ✅ (see Summary).
- Edge cases (empty/error/slow/dropped/reconnect/backgrounding): mostly handled. `attemptReconnect` is correct; `connect()` re-entry is **not** (gateway-003).
- Race conditions / cancellation: rejection-on-close pattern works for RPCs; `_connectGeneration` is missing (gateway-002).
- Error boundaries: N/A (logic layer, no UI).
- Promise rejections: every `_call` is wrapped or has explicit `.catch`. The `setTimeout` fallback inside `_call` rejects via the pending entry — fine.
- Exhaustive state transitions: chat states (`delta` / `error` / `final` / unknown→`chatStatus`) are covered. Agent streams (`assistant` / `tool` / `thinking` / `reasoning` / `compaction` / `lifecycle`) are covered, with a documented `ChatEvent:agent` `unhandled: true` log path for unknown streams.
- `_connectGeneration` discipline: **not implemented** (gateway-002).
- Stale response handling: rejections on close work; non-RPC async paths unguarded (gateway-002).
- Reconnect backoff: 1–30 s, ±25 % jitter, max 20 attempts ✅.
- Stream isolation: per-session `SessionStreamState`, `activeStreamKey` first-claim guard, source-claim guard ✅. Tested.
- Active stream key guard: ✅ tested.
- Per-session message cache: lives in `useChat`, not in `client.ts`. Out of this plan's scope (plan 04).
- Response watchdog: lives in `useChat` (gateway-008). Not in protocol layer.
- Defensive response parsing: `chat.history` handles 6+ shapes (line 35-46) ✅.
- `chat.history` display-normalized: yes — heartbeat/cron/no-reply filtering, system-notification stripping, conversation-metadata stripping. Not double-processing.
- `connect.challenge` flow: implemented at line 518-525, signed via `signChallenge`. Untested in mock (gateway-019).
- WS close codes: `onclose` reads `code`/`reason`/`wasClean`, distinguishes pre-handshake vs. post-handshake close, builds informative `rejectMsg`. ✅.
- All RPC methods: every domain module returns typed payloads; errors from `payload.error` are surfaced via `pending.reject(new Error(errorMsg))`.

### 2. Security
- Plaintext token logging: ✅ none. `this.token` is only used in `signChallenge` and the `auth` field of the `connect` request; never logged. The "ws.onerror"/"ws.onclose" debug objects do **not** include any auth field. URL is logged (gateway-006) but is not a credential.
- All credentials in `expo-secure-store`: device-identity wiring is in plan 02 scope, not here.
- Frame validation: gap (gateway-004).
- `dangerouslySetInnerHTML`: N/A (logic layer; markdown rendering is in plan 04).
- TLS enforced: protocol layer is URL-agnostic. URL-warn-on-`ws://` is in `useServerConfig` / `ConnectionContext` (plan 02/03).
- Deeplink validation: N/A.
- Clipboard: N/A.
- `AsyncStorage` for non-sensitive only: protocol layer does not touch AsyncStorage at all ✅.
- Ed25519 keypair handling: `signChallenge` is delegated to `device-identity` (plan 02 scope). `client.ts` correctly does not log `device.signature` / nonce / publicKey.
- Session token error states: surfaced via `error` event + `suppressReconnect = true` for auth failures (line 572) — no infinite loop.
- No `eval` / dynamic code: ✅ confirmed via `rg eval\\(` and `rg new Function`.

### 3. Performance
- List memoisation / FlashList: N/A (logic layer).
- Synchronous JSON parsing on the JS thread without chunking: yes, but the gateway frames are small (≤ a few KB per delta). The 50 KB runaway cap in `mergeIncoming` (line 769) prevents pathological accumulation.
- Cache eviction: out of plan scope (lives in `useChat`).
- Hot streaming path allocations: every `applyStreamText` call allocates a `streamChunk` payload object — unavoidable given the event API. The `mergeIncoming` overlap-search caps at 500 chars (line 799) — good.
- Provider tree: N/A.

### 4. Cleanliness / Maintainability
- File length limit (~300 lines): `client.ts` is **1693 lines** — the largest file in scope by a wide margin. Per `_RULES.md` line 32 "Splitting a large file into multiple files (flag the candidate, propose the split, don't execute)". Candidate splits: `notification-handler.ts` (the `handleNotification` switch + helpers), `stream-state.ts` (the `SessionStreamState` machine), `connection.ts` (connect/onclose/health/tick), `domain-api.ts` (the dozens of `_call.bind` wrappers at the bottom of the class). Listed here as a maintainability flag, not a finding.
- Module-level mutable globals: only `_nativeModule`/`_emitter` in `PinnedWebSocket.ts` — gateway-010.
- Single-responsibility hooks: N/A (no hooks in scope).
- Named exports: ✅ throughout.
- Explicit return types on all exported functions: ✅ verified (see Read tool spans above).
- Commented-out code blocks: ✅ none.
- Narrative comments: a few candidate comments around stream state are slightly verbose but they document hard-won subtlety (e.g. `client.ts` line 99-104 explaining `activeStreamKey`). Worth keeping.
- Dead branches: ✅ none observed in scope.
- Consistent error handling: catch + log pattern in `nodes.ts`, structured `{ ok, reason, message }` pattern in `installConventions.ts`, swallow-and-default in `agents.ts:setAgentFile`. The variation matches the contract each function exposes — acceptable.
- `const` over `let`: ✅ no `let` at module scope inside `src/lib/openclaw/`.

### 5. Tests
- Existing tests pass: `npm test --selectProjects logic` — see Test Impact below.
- Snapshots: none in scope.
- Critical-paths-with-no-tests: see gateway-019.

### 6. OSS-Readiness
- No internal hostnames / Tailscale names / ngrok / private IPs: ✅ verified via `rg`.
- No dev tokens / API keys: ✅ verified.
- No personal paths: ✅.
- `TODO(name)` references: ✅ none.
- Internal team channel/issue references: ✅ none.
- Strings public-safe: ✅.
- `.gitignore` hygiene: out of plan scope (X1 territory).
- Hard-coded gateway hostnames: ✅ none in protocol layer.
- Protocol-version constant a named export: `client.ts` uses `minProtocol: 3, maxProtocol: 3` as inline numeric literals (line 453-454). `appMeta.ts` has `PROTOCOL_VERSION = '1'` which is **a different value** and is not imported here. Mild OSS-hygiene smell — protocol version should be a single named constant. Logged below as a follow-up item.

### 7. i18n / Accessibility
- N/A (pure logic layer — no UI strings).

## Open Questions for Human

1. **`_connectGeneration` adoption (gateway-002)**: do we want a full generation-counter rewrite of the async-cancellation pattern, or is the current rejection-on-close + nullable-`this.ws` approach considered "documented as different but equivalent"?  The latter is defensible but contradicts `.cursorrules`. A short ADR would resolve the ambiguity once.
2. **`setAgentFile` swallow-and-return-false (`agents.ts:93-100`)**: The function reports `false` when the gateway rejects a write. Callers (`installConventions.ts`) translate that into `{ ok: false, reason: 'rpc_failed', message: 'agents.files.set returned false' }` — the original error message is lost. Should `setAgentFile` be allowed to throw and let `installConventions` shape the error?
3. **Protocol-version constant**: `appMeta.ts` exports `PROTOCOL_VERSION = '1'` but `client.ts` uses literal `3`. They are different concepts (app vs. wire) but the naming collision is misleading. Worth deciding which file owns the wire-protocol version constant. (Can wait for X1 OSS hygiene plan.)
4. **`refreshCanvasCapability` / `buildCanvasUrl` (gateway-011)**: keep speculative or delete?

## Test Impact

- Command: `npm test -- --selectProjects logic` (the literal `npm test --selectProjects logic` does not pass the flag through to Jest under recent npm; the `--` form is the working equivalent).
- Result, post-auto-fix: **42 passed, 1 failed**, **779 passed, 5 failed** tests, **784 total**. Time ~3.2 s.
- The single failing suite is `src/lib/chatCache/__tests__/validateBlob.test.ts` — five `expect(version).toBe(3)` assertions failing because the on-disk schema is now `4`. **This is out of the gateway-protocol scope (chatCache is owned by plan 04 chat-streaming) and pre-existed this audit.** Verified by running on the un-modified base (the failure is identical with or without the auto-fix in `agents.ts`).
- All openclaw-client / clientContext / installConventions / interactive / pinned-websocket tests pass.
- No new tests added (out-of-scope per `_RULES.md`).
