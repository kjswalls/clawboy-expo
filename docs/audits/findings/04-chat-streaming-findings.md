# Chat UI & Streaming Findings

Date: 2026-05-09
Agent: claude-sonnet-4-5
Status: done

## Summary

The chat streaming subsystem is well-implemented with solid stream-isolation discipline, correct generation-counter guards, an encrypted disk cache, and thoughtful performance optimisations (RAF-coalesced chunks, segmented markdown rendering, React.memo throughout). The main concerns are size — three files far exceed the 300-line guideline and are split candidates — plus a missing crypto unit test and a missing `accessibilityLiveRegion` on streaming content.

## Severity Counts

- critical: 0
- high: 0
- med: 3
- low: 3
- nit: 2

## Findings

| ID | Sev | File:Line | Summary | Recommendation | Status |
|----|-----|-----------|---------|----------------|--------|
| chat-001 | med | src/hooks/useChat.ts:1 | `useChat.ts` is 1865 lines — 6× the ~300-line guideline | Propose split: extract `useChatEventSubscriptions` (the large `useEffect` subscribing to 11 events, ~750 lines), `useChatSend` (sendMessage + abortResponse + retryMessage, ~350 lines), leaving the main hook as a thin compositor. The pure helper functions at the top (closePendingPart, upsertThinkingPart, etc.) can move to a co-located `chatHelpers.ts`. | proposed |
| chat-002 | med | src/components/chat/MessageBubble.tsx:1 | `MessageBubble.tsx` is 1225 lines — 4× the guideline | The file already defines 6 sub-components (MessageBlocks, MessageBody, MessageParts, StreamingTextPart, MessageBubbleActions, MessageBubble). Extract each into its own file under `src/components/chat/`. The link/paragraph/fence rule factories (~100 lines) can move to `src/utils/markdownRules.ts`. | proposed |
| chat-003 | med | src/components/chat/MessageList.tsx:1 | `MessageList.tsx` is 1097 lines — 3.7× the guideline | Extract session-transition animation logic (~120 lines) into `useMessageListTransition.ts`, scroll management (~120 lines) into `useMessageListScroll.ts`, leaving MessageList as a thinner render coordinator. | proposed |
| chat-004 | low | src/lib/chatCache/crypto.ts:1 | `sealBytes`/`openBytes` (AES-256-GCM) have no unit tests | Add `src/lib/chatCache/__tests__/crypto.test.ts` covering: (1) seal then open round-trip, (2) openBytes returns null for a truncated packet, (3) openBytes returns null when no key exists, (4) seal produces a fresh IV each call (ciphertexts differ). | proposed |
| chat-005 | low | src/hooks/useChat.ts:1415–1423 | `onChatStatus` handler has no production logic; it only performs a dev-mode `console.log` of the full gateway payload | Remove the `console.log` call (auto-fixable per rules). The subscription itself can remain (the handler becomes a no-op, harmless). | fixed |
| chat-006 | low | src/hooks/useMediaCacheReplay.ts:26 | `JSON.parse(raw) as boolean` uses a TypeScript cast without runtime type narrowing; a corrupted AsyncStorage value will silently set `enabled` to a non-boolean | Change to `const parsed = JSON.parse(raw); if (typeof parsed === 'boolean') setEnabledState(parsed);` | proposed |
| chat-007 | nit | src/components/chat/ThinkingNode.tsx:1 | ThinkingNode.tsx is 348 lines — slightly above the ~300-line guideline | Minor: extract the shimmer rendering (MaskedView + LinearGradient + RNAnimated loop, ~60 lines) into a co-located `ThinkingShimmer.tsx`. | proposed |
| chat-008 | nit | src/components/chat/StreamingText.tsx:49 | `StreamingText` component (the typing-dots pill) has no `accessibilityLiveRegion` — screen readers will not announce when streaming begins or ends | Add `accessibilityLiveRegion="polite"` and `accessibilityLabel` to the container `View` of `StreamingText`. For the inline streaming bubble in `MessageBody`/`StreamingTextPart`, add `accessibilityLiveRegion="polite"` to the wrapper View so VoiceOver/TalkBack can announce updates. | proposed |

## Auto-Fixes Applied

- chat-005 (low): removed the non-critical `console.log('[useChat:chatStatus]', payload)` dev-only log inside `onChatStatus` in `src/hooks/useChat.ts`. The handler is now a generation-guard no-op, which is correct — `chatStatus` events currently have no production consumer.

## Open Questions for Human

- **chat-001 split**: The 11-event `useEffect` in `useChat.ts` captures many closure variables (`updateSessionMessages`, `flushSessionToDisk`, `setActivity`, etc.). Any split must pass these through props/args rather than closure capture to avoid stale-closure bugs. The human should review the proposed split boundary before execution.
- **chat-006**: Is there any migration path if existing AsyncStorage values are malformed (e.g., the key stores a string `"1"` from an older build)? The proposed fix silently ignores non-boolean values, leaving the default (`true`). Confirm this is acceptable.
- **chat-004 crypto tests**: The `sealBytes`/`openBytes` functions depend on `expo-secure-store` and `expo-crypto` which require native mocking in Jest. Confirm that the project's Jest setup includes the necessary mocks (check `jest.setup.ts` / `jest.config.ts`) before adding the test file.

## Test Impact

- `npm test --selectProjects components`: 9 snapshot failures in `MessageBubble.test.tsx` and `ThinkingNode.test.tsx` — **pre-existing on base branch** (time-format timezone drift in snapshots, unrelated to this audit). 115 tests pass.
- `npm test --selectProjects logic`: 5 failures in `validateBlob.test.ts` — **pre-existing on base branch** (tests expect schema version 3 but implementation has advanced to version 4, a stale snapshot issue). 779 tests pass.
- The auto-fix applied (chat-005: removed `console.log` in `onChatStatus`) does not affect any test outcomes — the handler had no test coverage.
- No new tests added (test additions are proposed-only per `_RULES.md`)
