# Session Reset — Restore "Session reset." Marker + Investigate Missing Greeting

> Status: **Ready to execute.** Pickup-friendly handoff doc — written so another agent can pick this up cold.
> Last updated: 2026-04-26
> Owner on hand-off: any agent
> Related: [`.cursorrules`](../../.cursorrules) (chat-event/streaming patterns), protocol-layer tests in [`src/lib/__tests__/openclaw-client.test.ts`](../../src/lib/__tests__/openclaw-client.test.ts) under `describe('resetSession', …)`.

## TL;DR

Two bugs in the `/reset` slash-command flow:

1. **Marker is in the wrong place.** The "─── Session reset. ───" divider is appended **after** the `sessions.reset` RPC resolves, but the OpenClaw gateway streams the new agent greeting **during** that same RPC. Net effect: the marker lands *below* the greeting at the very bottom of the chat, easy to miss. **Fix:** insert it synchronously *before* the await so it sits on top, then the greeting streams in below it.
2. **The new agent greeting often doesn't appear at all.** Cause is suspected to be stale singleton stream state inside `useChat` (`streamMessageIdRef.current`, `isStreaming`, watchdog, RAF batch) surviving `clearMessages(sk)`. When the gateway's startup greeting events arrive, `ensurePlaceholder` early-bails on the stale truthy ref and chunks get routed to a deleted message id — silently dropped. **Plan:** instrument first, then fix once a real trace confirms where the events go missing.

Fix 1 is a small, safe restructuring. Fix 2 is diagnostics-only on this pass; the actual code-path fix is deferred until the trace lands.

## Background — what `/reset` does today

```467:498:app/index.tsx
      case 'reset': {
        if (!currentSessionKey) return;
        const sk = currentSessionKey;
        beginActivity(sk, 'resetting', 'Resetting session...');
        // Clear local display immediately so old turns don't linger during the RPC.
        clearMessages(sk);
        void (async () => {
          try {
            await resetSession(sk);
            // Marker only appears after the RPC succeeds so it doesn't show
            // while the reset is still in-flight.
            appendMessage(sk, {
              id: `reset-${generateUUID()}`,
              role: 'assistant',
              kind: 'info',
              content: 'Session reset.',
              timestamp: new Date().toISOString(),
            });
            // No clearMessages / loadHistory here — the gateway streams a startup
            // greeting via chat events after sessions.reset resolves, and the
            // existing chat-event handlers in useChat will append it to the
            // (now-empty) session naturally.
          } catch (err) {
            Alert.alert(
              'Reset failed',
              err instanceof Error ? err.message : 'Could not reset the session.',
            );
          } finally {
            endActivity(sk);
          }
        })();
        return;
      }
```

The protocol layer notes (correctly) that the gateway streams the greeting *during* the RPC, not after:

```1464:1488:src/lib/openclaw/client.ts
  async resetSession(sessionKey: string): Promise<void> {
    // Must clear BEFORE the RPC: the gateway often streams the startup greeting
    // (agent events + chat:final) before it sends the sessions.reset response.
    // Those events would otherwise hit ss.finalized=true left by the prior turn
    // and be silently dropped by the suppression guard in handleNotification.
```

So the comment in `app/index.tsx` ("after sessions.reset resolves") is misaligned with reality — the greeting is already in flight by the time we append the marker, which is why the marker visually lands at the bottom.

The protocol-layer tests already verify the greeting events themselves are emitted correctly post-reset — see `it('clears ss.finalized so post-reset startup greeting streams through')`, `it('resets activeStreamKey so the greeting can claim the stream slot')`, and the "interleaved" regression test in [`src/lib/__tests__/openclaw-client.test.ts`](../../src/lib/__tests__/openclaw-client.test.ts) (around lines 850–1015). That means Fix 2 lives in the UI layer (`useChat`), not in the protocol layer.

## Suspected root cause for the missing greeting

`useChat` keeps `streamMessageIdRef` pointing at the active streaming placeholder, plus several singletons for the in-flight turn (`isStreaming`, `watchdogRef`, `pendingBatchRef`, `chunkRafRef`, `streamingPhaseRef`, `currentThinkingPartRef`). `clearMessages(sk)` only wipes the message cache — it does **not** clear any of those.

The early-bail in `ensurePlaceholder` is the smoking gun:

```657:666:src/hooks/useChat.ts
    const ensurePlaceholder = (sk: string): void => {
      if (streamMessageIdRef.current) {
        // Placeholder already exists; just restart the watchdog so the timer
        // resets from when the server actually began responding.
        clearWatchdog();
        watchdogRef.current = setTimeout(() => {
          appendWatchdogTimeout(sk);
        }, RESPONSE_WATCHDOG_MS);
        return;
      }
```

The early-race path right below it was *specifically designed* for the post-reset greeting case — but only fires when `mid` is null:

```731:741:src/hooks/useChat.ts
      let mid = streamMessageIdRef.current;
      if (!mid) {
        // Early-race: text chunks arrived before chatAwaitingResponse/streamStart
        // (e.g. the gateway startup greeting after sessions.reset). Create a
        // placeholder so this content is not silently dropped.
        ensurePlaceholder(sk);
        mid = streamMessageIdRef.current;
      }
```

If `streamMessageIdRef.current` is still set from a prior turn (or anything that didn't finalize cleanly) when `/reset` runs, the cleared cache no longer contains the message it points to. Subsequent `updateSessionMessages(sk, prev => prev.map(m => m.id !== mid ? m : ...))` no-ops, and the greeting is silently dropped.

## Fix 1 — Marker above the greeting (Option A, safe to land standalone)

**File:** [`app/index.tsx`](../../app/index.tsx), `case 'reset'`.

Restructure to insert the divider **synchronously**, before the await. On RPC failure, remove the marker by id so a failed reset doesn't leave a misleading divider behind.

Sketch:

```tsx
case 'reset': {
  if (!currentSessionKey) return;
  const sk = currentSessionKey;
  const markerId = `reset-${generateUUID()}`;
  beginActivity(sk, 'resetting', 'Resetting session...');
  clearMessages(sk);
  appendMessage(sk, {
    id: markerId,
    role: 'assistant',
    kind: 'info',
    content: 'Session reset.',
    timestamp: new Date().toISOString(),
  });
  void (async () => {
    try {
      await resetSession(sk);
      // Gateway-streamed greeting (if any) appends below the marker via
      // chat events already wired up in useChat.
    } catch (err) {
      removeMessage(sk, markerId);
      Alert.alert(
        'Reset failed',
        err instanceof Error ? err.message : 'Could not reset the session.',
      );
    } finally {
      endActivity(sk);
    }
  })();
  return;
}
```

**Supporting helper:** add `removeMessage(sessionKey, id)` next to `appendMessage` in [`src/hooks/useChat.ts`](../../src/hooks/useChat.ts) and re-export it via the `UseChatResult` interface. Implementation mirrors `appendMessage`:

```ts
const removeMessage = useCallback(
  (sessionKey: string, id: string): void => {
    updateSessionMessages(sessionKey, (prev) => prev.filter((m) => m.id !== id));
  },
  [updateSessionMessages]
);
```

Update [`UseChatResult`](../../src/hooks/useChat.ts) (around line 285) to add:

```ts
/** Remove a single message from a session's cache by id. */
removeMessage: (sessionKey: string, id: string) => void;
```

Update the destructure in [`app/index.tsx`](../../app/index.tsx) (around line 250-275) to pull `removeMessage` out of `useChat()`.

Also update the stale comment that says the greeting comes *after* `sessions.reset` resolves — replace it with a one-liner pointing at the comment in [`src/lib/openclaw/client.ts`](../../src/lib/openclaw/client.ts) that explains the actual ordering.

### Definition of done — Fix 1

- `/reset` on a session with prior messages: divider appears at the top of the now-empty chat **immediately**, then any agent greeting streams in below it.
- `/reset` while disconnected (or a forced RPC failure): divider does **not** linger; alert shows.
- No new lints; existing `useChat`-using sites compile.
- `src/lib/__tests__/openclaw-client.test.ts` still passes (no protocol changes).

## Fix 2 — Investigate the missing greeting (diagnostics-first, no behavioral change)

Goal: capture exactly which events arrive after `/reset` in the user's actual deployment, before patching `clearMessages` or any other code path.

### Add `EXPO_PUBLIC_DEBUG_CHAT_EVENTS`-gated logs

Piggyback on the dev flag already used in [`src/lib/openclaw/client.ts`](../../src/lib/openclaw/client.ts) (search for `EXPO_PUBLIC_DEBUG_CHAT_EVENTS`). Wrap each new log in:

```ts
if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_CHAT_EVENTS === '1') {
  console.log('[Reset] …');
}
```

Three insertion sites:

1. **`app/index.tsx` — `case 'reset'`**: log entry, the `currentSessionKey`, and timestamps before/after `await resetSession(sk)` and after `appendMessage`. Helps correlate the timeline against incoming events.
2. **`src/hooks/useChat.ts` — chat-event handlers**: at the top of each of `onAwaitingResponse`, `onStreamStart`, `onStreamChunk`, `onThinkingChunk`, `onMessage`, `onStreamEnd`, log:

   ```ts
   {
     handler: '<name>',
     payloadSessionKey: p?.sessionKey,
     resolvedSk: sk,
     currentSessionKey: currentSessionKeyRef.current,
     streamMid: streamMessageIdRef.current,
     cacheLen: sessionCacheRef.current.get(sk ?? '')?.length ?? 0,
   }
   ```

   This makes the "ref-stale-after-clearMessages" condition immediately visible in the trace.
3. **`src/hooks/useChat.ts` — `ensurePlaceholder`**: log when the early-bail (`streamMessageIdRef.current` truthy) is taken vs. when a fresh placeholder is created, including the truthy id when bailing.

### Verification flow

1. In dev, set `EXPO_PUBLIC_DEBUG_CHAT_EVENTS=1` (env var, e.g. via `.env.local` or shell when running `npx expo run:ios`).
2. Reproduce: open the app, wait for a session greeting, send a few messages, then run `/reset`.
3. Capture the Metro/JS log lines from the moment `/reset` fires through ~5s after.
4. Triage:
   - **Chunks arrive but `ensurePlaceholder` early-bails** ⇒ the suspected root cause is confirmed. Implement the *deferred* Fix 2A below.
   - **Chunks never reach `useChat` handlers** ⇒ check `parentSessionKeys` / `defaultSessionKey` / system-session-key routing in [`src/lib/openclaw/client.ts`](../../src/lib/openclaw/client.ts) (`SYSTEM_SESSION_RE`, `maybeEmitSessionKey`, `resolveEventSessionKey`).
   - **Protocol events never arrive at all** (no `[ChatEvent:agent]` / `[ChatEvent:chat:final]` lines from the existing client logs) ⇒ gateway-side issue, likely `session.greetingPrompt` config; surface to user, no client fix.

### Deferred Fix 2A (only land after diagnostics confirm)

If the trace shows chunks arriving while `streamMessageIdRef.current` is truthy after a `clearMessages`, extend `clearMessages` in [`src/hooks/useChat.ts`](../../src/hooks/useChat.ts) (around line 1500) so wiping a session's cache also resets the per-stream UI singletons when the cleared session is the active stream target:

- `streamMessageIdRef.current = null`
- `setIsStreaming(false)`
- `clearWatchdog()`
- Cancel pending RAF batch (`pendingBatchRef.current = null`, `cancelAnimationFrame(chunkRafRef.current); chunkRafRef.current = null`)
- Reset phase refs: `streamingPhaseRef.current = 'none'`, `currentThinkingPartRef.current = null`, `thinkingPartCounterRef.current = 0`

Scope the cleanup to `sessionKey === currentSessionKeyRef.current` (the only session whose stream UI state lives in the singleton refs). `/clear` benefits from the same hygiene.

Add a regression test under [`src/hooks/__tests__/`](../../src/hooks/__tests__) (or alongside the protocol tests) that asserts: after `clearMessages(sk)` while `streamMessageIdRef` is truthy, a subsequent `streamChunk` event creates a fresh placeholder and the chunk's text lands in the cache.

### Definition of done — Fix 2 (this pass)

- Diagnostics merged behind `EXPO_PUBLIC_DEBUG_CHAT_EVENTS`, no production cost.
- A captured trace from the user's gateway is attached to the follow-up issue/PR with a concrete diagnosis (one of the three triage outcomes above).
- Either Fix 2A is queued as a follow-up with the trace as evidence, or the gateway-side path is documented and the issue is closed client-side.

## Files to touch

- [`app/index.tsx`](../../app/index.tsx) — restructure `case 'reset'`; wire `removeMessage`; gated diagnostic logs; refresh the stale comment.
- [`src/hooks/useChat.ts`](../../src/hooks/useChat.ts) — add `removeMessage(sk, id)` helper, export via `UseChatResult`; add gated diagnostic logs in chat-event handlers and `ensurePlaceholder`.
- [`src/lib/__tests__/openclaw-client.test.ts`](../../src/lib/__tests__/openclaw-client.test.ts) — no edits; existing tests should still pass.

## Out of scope (this pass)

- InfoMarker visual styling (size, weight, icon).
- Behavior changes to `clearMessages` — gated on a real diagnostic trace per Fix 2.
- Server-side gateway behavior (the `session.greetingPrompt` config lives on the gateway, not in this repo).
- Replacing the inline divider with a toast/banner (explicitly rejected by the user — Option A is the chosen UX).

## Step-by-step checklist for the executing agent

1. Read this doc plus the cited code references in `app/index.tsx`, `src/hooks/useChat.ts`, and `src/lib/openclaw/client.ts`.
2. Implement `removeMessage` in `useChat`, export via `UseChatResult`.
3. Restructure `case 'reset'` in `app/index.tsx` per Fix 1.
4. Add the diagnostic logs per Fix 2 (gated, dev-only).
5. Lint clean and run the existing `openclaw-client.test.ts` suite to confirm no protocol-layer regressions.
6. Open a PR with both the Fix 1 changes and the diagnostic instrumentation.
7. In the PR description, ask the user to capture a `EXPO_PUBLIC_DEBUG_CHAT_EVENTS=1` trace of `/reset` and attach it; use that trace to decide on Fix 2A in a follow-up PR.
