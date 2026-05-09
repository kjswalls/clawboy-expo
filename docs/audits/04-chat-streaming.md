# Audit Plan: Chat UI & Streaming

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/04-chat-streaming-findings.md` plus any allowed auto-fixes.
> Do NOT modify any file outside the declared scope.
> Do NOT modify this plan file.

---

## 1. Scope

```
src/components/chat/**
src/hooks/useChat.ts
src/hooks/useChatDiskHydration.ts
src/hooks/useStreamReveal.ts
src/hooks/useMediaCacheReplay.ts
src/lib/messageBlocks.ts
src/lib/messageMerge.ts
src/lib/chatCache/**
src/components/chat/__tests__/**
src/hooks/__tests__/ (chat-related files)
src/lib/__tests__/ (chatCache, messageBlocks, messageMerge)
```

## 2. Out of Scope

- `src/lib/openclaw/` — covered in plan 01
- `src/lib/media/` — covered in plan 11
- `src/lib/annotations.ts` — covered in plan 12
- All other files not listed above
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. `.cursorrules` — **Security** rules 3, 4; **Protocol Layer** streaming section; **Patterns to steal from ClawControl** (stream isolation, cache size cap, response watchdog)
2. `docs/plans/option-b-encrypted-chat-cache.md` (if present) — encrypted cache design
3. `docs/audits/_CHECKLIST.md`
4. `docs/audits/_RULES.md`

## 4. Concern Checklist

Work through `docs/audits/_CHECKLIST.md` in full, plus these area-specific checks:

### Correctness (area-specific)

- [ ] Stream isolation: switching sessions during active stream does not leak chunks into wrong session
- [ ] Per-session message cache has a size cap — no unbounded growth
- [ ] `useStreamReveal` animations do not drop text chunks if render falls behind stream rate
- [ ] `useChatDiskHydration`: stale disk data does not overwrite a live stream in progress
- [ ] `useMediaCacheReplay`: replayed media events match the correct message positions
- [ ] `messageBlocks.ts` parser handles all documented block types (text, thinking, tool call, tool result, internal event, interactive options) without crashing on unknown types
- [ ] `messageMerge.ts`: merging streamed chunks produces correct final message — no duplication, no dropped characters
- [ ] Empty session (no messages): `EmptyChatState` renders, no crash
- [ ] `MessageList` scroll-to-bottom behavior: auto-scrolls on new messages only if user is already at bottom
- [ ] App backgrounded during stream: resumes correctly on foreground, does not double-render chunks
- [ ] `chat.history` results do not get double-processed (control tokens already stripped by gateway)
- [ ] Abort: `chat.abort` stops stream, UI reflects aborted state cleanly

### Security (area-specific)

- [ ] All rendered message content goes through `@ronradtke/react-native-markdown-display` — no raw HTML rendering
- [ ] Tool call output rendered safely — no code execution path from rendered output
- [ ] Media URLs from gateway validated before being passed to `expo-image` / `expo-video`
- [ ] Chat cache encrypted at rest (verify per `docs/plans/option-b-encrypted-chat-cache.md` if implemented)
- [ ] No message content logged to console

### Performance (area-specific)

- [ ] `MessageBubble` wrapped in `React.memo` — confirm no unnecessary re-renders
- [ ] `MessageList` / `FlashList`: `keyExtractor` stable, `getItemLayout` used if item heights are fixed, `windowSize` appropriate for chat
- [ ] `ThinkingNode` and `ToolCallCard` collapse/expand animations use Reanimated worklets (UI thread)
- [ ] `StreamingCursor` animation runs on UI thread, not JS thread
- [ ] `StreamingText` does not cause a re-render of the entire message list on each character chunk
- [ ] `CodeBlock` syntax highlighting does not block render for large code blocks (check for deferred/async highlighting)

### Cleanliness / Maintainability (area-specific)

- [ ] `useChat.ts` under ~300 lines; flag if not — it is a critical split candidate
- [ ] `MessageList.tsx` under ~300 lines
- [ ] No demo data imported into production chat components (verify `src/lib/demo/` only used conditionally)
- [ ] `chatCache` store, types, crypto, and bytes modules are properly separated

### Tests (area-specific)

- [ ] `messageBlocks.ts` parser has unit tests for every block type
- [ ] `messageMerge.ts` has unit tests for edge cases (empty stream, aborted stream, multi-chunk)
- [ ] `chatCache` crypto has unit tests

### OSS-Readiness (area-specific)

- [ ] No hard-coded session IDs, message IDs, or user IDs in component defaults or fallbacks
- [ ] No internal test gateway responses hard-coded in source

### i18n / Accessibility (area-specific)

- [ ] Thinking node expand/collapse button has `accessibilityLabel` and `accessibilityRole`
- [ ] Tool call status text uses `t()` keys
- [ ] `accessibilityLiveRegion` or equivalent on streaming text (to inform screen reader of updates)

## 5. Deliverable

Write output to: `docs/audits/findings/04-chat-streaming-findings.md`

Finding IDs: `chat-NNN`.

## 6. Exit Criteria

- [ ] `docs/audits/findings/04-chat-streaming-findings.md` written
- [ ] Severity counts accurate
- [ ] All auto-fixable items fixed or deferred
- [ ] `npm test --selectProjects components` and `npm test --selectProjects logic` pass
- [ ] Row 04 in `docs/audits/README.md` flipped to `done`
