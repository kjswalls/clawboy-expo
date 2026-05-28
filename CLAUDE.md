# CLAUDE.md

Project guide for LLM agents in `clawboy-expo`. Read before changing anything substantive.

## Quick Orient

- **Stack:** React Native 0.83.4, Expo SDK 55, expo-router, FlashList 2.0.2 (patched), react-native-reanimated 4.2, react-native-keyboard-controller, react-native-worklets, TypeScript strict + `noUncheckedIndexedAccess`.
- **Backend:** Supabase. Chat in `src/lib/openclaw/chat.ts`.
- **State:** No Redux/Zustand. Context + hooks. Critical state machines run as `useRef` + `useEffect` in `MessageList.tsx` / `useChat.ts` — extraction to pure reducers planned (see "Planned refactors").
- **Tests:** Jest 29. Two projects: `logic` (Node) + `components` (jest-expo/ios preset). Reanimated mock at `src/__mocks__/reanimated.js`. Snapshots under `__snapshots__/`.

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # biome check . (Biome 2.x, lint-only — formatter & assist disabled)
npm test            # both projects
npm run test:logic
npm run test:components
npm run verify      # typecheck + lint + test — same as pre-push hook
```

Pre-push hook (simple-git-hooks) runs `npm run verify`. Bypass once with `git push --no-verify` or `SKIP_SIMPLE_GIT_HOOKS=1 git push`.

## Fragile Surfaces — Read Before Touching

Each surface lists invariant, test/locking site, bug history. Most live in two files: `src/components/chat/MessageList.tsx` (~1700 lines) and `src/hooks/useChat.ts`. Both dense, interaction-heavy.

### 1. Send-anchor + `sendAnchorHeld` latch

- **Where:** [src/components/chat/MessageList.tsx](src/components/chat/MessageList.tsx) §send-anchor effect + `rawNeedsAnchorSpace`.
- **Invariant:** User msg lands ~top of viewport on send; anchor held past stream-end via `sendAnchorHeld`; release only on pill tap, session swap, or `onScroll` when `distFromEnd >= 0 && !sendAnchorPendingRef`.
- **Lock:** [plans/scroll-handling.md](plans/scroll-handling.md) §4, §6, Bug #9, Bug #12, Bug #13.
- **Why regresses:** clears + sets of `sendAnchorHeldRef` scattered. Miss one path → iOS UIScrollView clamps mid-collapse (Bug #9) or 2nd-send snaps to bottom (Bug #13).

### 2. 2-stage rAF cascade (`needsAnchorSpace` + `mvcpAnchorMode`)

- **Where:** [src/components/chat/MessageList.tsx](src/components/chat/MessageList.tsx) lines ~421-470 (`raw || hold` pattern).
- **Invariant:** Rising edge **synchronous** (spacer + MVCP-off commit in same render as user msg); falling edge held **1 rAF** (`holdAnchor`), MVCP held **additional rAF** (`holdMvcp`). Total 2 rAFs after `rawNeedsAnchorSpace` falls.
- **Lock:** [plans/scroll-handling.md](plans/scroll-handling.md) §6, Bug #9 Pass 2, Bug #12.
- **Why regresses:** Looks like overcomplicated state-defer; isn't. Collapsing to single-stage re-introduces snap-to-bottom on short replies.

### 3. MVCP gate + patched FlashList

- **Where:** `flashListMvcp` 4-branch decision (`MessageList.tsx:1060-1085`) + `patches/@shopify+flash-list+2.0.2.patch`.
- **Invariant:** `autoscrollToBottomThreshold = -1` (disabled) while `needsAnchorSpace`, `annotationFocusActive`, or `historyLoading`. Patch clears armed `pendingAutoscrollToBottom` flag when threshold goes <0.
- **Lock:** [plans/scroll-handling.md](plans/scroll-handling.md) §6, Bug #2 refinements.
- **Why regresses:** Bumping FlashList past 2.0.2 silently breaks patch. `patch-package` postinstall must succeed.

### 4. Keyboard worklet Path A + Path B

- **Where:** `useKeyboardHandler` worklet (`MessageList.tsx:1052-1079`) calls `onKeyboardFrame` per-frame via `runOnJS`. Path A = composer focus tail-tracking; Path B = annotation reveal.
- **Invariants:** Both gated on (`!isResetting && pinToBottomRef===null && !inPinWindow && !needsAnchorSpaceRef`). `measureLayout` cached **once** at `armPendingReveal`, reused per frame. Per-frame `scrollToOffset` uses `animated:false`.
- **Lock:** [plans/scroll-handling.md](plans/scroll-handling.md) §7, Bug #2, Bug #6, Bug #13.
- **Why regresses:** Per-frame async measure → flurry of late scrolls. Path A firing during send-anchor → 2nd-send snap.

### 5. Annotation focus-mode exit defer

- **Where:** `annotationFocusActiveLatched` mirror in [app/index.tsx](app/index.tsx). True→false flip held until `KeyboardEvents.keyboardDidHide` (500ms safety timer). Re-entry race handled via `exitIntentRef`.
- **Invariant:** Focus-mode chrome stays mounted through entire kb-hide animation. State clears in same finish callback. Cancel on re-engagement.
- **Lock:** [plans/scroll-handling.md](plans/scroll-handling.md) §7 "Focus-mode exit defer", Bug #7.
- **Why regresses:** Synchronous flip → chrome collapses mid-kb-hide → iOS UIScrollView Δ-478 clamp.

### 6. Pin-to-bottom latch + `pinUntilTsRef` window

- **Where:** `pinToBottom.ts` (pure decision), arm sites listed in `plans/scroll-handling.md` §3.
- **Invariant:** Arm latch via `pinToBottomRef`, don't call `scrollToEnd` directly from outside `MessageList`. Pin window = 5000ms (bumped from 1500ms for slow-skeleton sessions). `skeletonActiveRef` bypass forces re-pin while skeleton mounted.
- **Lock:** [plans/scroll-handling.md](plans/scroll-handling.md) §3, Bug #1.
- **Why regresses:** Direct `scrollToEnd` calls bypass latch ordering, fire before measured geometry. Stale `userTookControlRef` blocks pin-window bypass.

### 7. Stream-ID identity merge

- **Where:** [src/lib/messageMerge.ts](src/lib/messageMerge.ts) + [src/hooks/useChat.ts](src/hooks/useChat.ts).
- **Invariant:** Composite-key identity recovery `(role, timestamp, content)` lets messages cached under temp/random ids adopt canonical `__openclaw.id` on next merge. Without it, every history reconcile remounts all 15+ cells (Bug #1 Mode B contributor).
- **Lock:** [src/lib/__tests__/messageMerge.test.ts](src/lib/__tests__/messageMerge.test.ts), [src/hooks/__tests__/useChat.cache.test.ts](src/hooks/__tests__/useChat.cache.test.ts). Extend coverage when touching merge logic.
- **Why regresses:** New id source without updating composite-key fallback re-introduces remount churn.

### 8. `getSessionMessages` error propagation

- **Where:** [src/lib/openclaw/chat.ts](src/lib/openclaw/chat.ts), reconcile + retry in [src/hooks/useChat.ts](src/hooks/useChat.ts).
- **Invariant:** RPC failures THROW (don't return `[]`). Reconcile retries up to 3× with 2s backoff on `'error'` status.
- **Lock:** [plans/scroll-handling.md](plans/scroll-handling.md) Bug #11.
- **Why regresses:** Silent catch → empty list → reconcile thinks session truly empty → no retry → "truncated history" symptom.

### 9. ExperimentsContext flag schema

- **Where:** [src/contexts/ExperimentsContext.tsx](src/contexts/ExperimentsContext.tsx), tests in `src/contexts/__tests__/`.
- **Invariant:** Storage key `clawboy-experiments-v1`. Persist payload field order load-bearing for test snapshot match. Current defaults: `stableProps=true`, `suppressInputAccessibility=true`, `autoRenameSessions=true`; rest `false`. Env vars (`EXPO_PUBLIC_IOS_INPUT_*`) override storage and lock flag.
- **Lock:** [src/contexts/__tests__/ExperimentsContext.test.tsx](src/contexts/__tests__/ExperimentsContext.test.tsx).
- **Why regresses:** New flag without updating all "set...persists" tests breaks JSON-payload exact-match.

### 10. ToolCallGroup auto-collapse init

- **Where:** [src/components/chat/ToolCallGroup.tsx](src/components/chat/ToolCallGroup.tsx) lazy-init `autoCollapsed` from `allDone`.
- **Invariant:** Groups mounting already-completed (history load) must NOT fire 2.5s expand→collapse animation. Animation only on live-streaming completion.
- **Lock:** [plans/scroll-handling.md](plans/scroll-handling.md) Bug #1 mitigations.
- **Why regresses:** `useState(false)` + `useEffect` flip on `allDone` re-introduces 96px-per-group shrink storm during cold-start settle.

## Before Touching MessageList.tsx or useChat.ts

1. Read [plans/scroll-handling.md](plans/scroll-handling.md) end-to-end. All 676 lines. Especially §2 (programmatic scroll catalog), §4 (decision gates), §12 (known bugs).
2. Run `npm run verify` first for green baseline.
3. Decide: state-machine change (anchor / MVCP / latch / merge), render-tree change (component reordering), or side-effect change (scroll/measure)? Treat separately — don't bundle.
4. Changing scroll behavior → walk §10 contract checklist before committing.
5. Extracting to pure module under `src/lib/chat/` → write unit tests first (planned Layer 2 work).

## Don't-Do List

- **Don't add `useEffect`-driven scroll positioning.** Use worklet path (Path A or B in §7) or arm pin-to-bottom latch. Direct effects fire too late, race against MVCP.
- **Don't call `scrollToEnd` from outside `MessageList`.** Arm latch (`pinToBottomRef`), let `onContentSizeChange` consume with right geometry.
- **Don't add new refs to MessageList without auditing existing anchor refs** (`sendAnchorHeldRef`, `sendAnchorPendingRef`, `needsAnchorSpaceRef`, `pinToBottomRef`, `pendingRevealRef`, `userTookControlRef`, `composerFocusFlagRef`, `keyboardHRef`, `baselineLayoutHRef`, `armBaseLayoutHRef`, `cachedRevealMeasureRef`, `finalKbHeightRef`, `revealScrolledOnceRef`, `offsetYRef`, `layoutHRef`, `spacerHeightRef`, `pinUntilTsRef`, `skeletonActiveRef`, `isResettingRef`, `isUserDraggingRef`, `isNearBottomRef`). They interact; check §4 in plan.
- **Don't bundle unrelated scroll bugs.** One bug per pass. Verify §10 contracts before moving on.
- **Don't run `measureLayout` per worklet tick.** Cache once at arm time (`cachedRevealMeasureRef` pattern) — async layout calls flush as visible flurry.
- **Don't downgrade or bump FlashList past 2.0.2** without re-applying / re-validating `patches/@shopify+flash-list+2.0.2.patch`. Patch is only thing making MVCP-off branches actually disable autoscroll.
- **Don't remove diagnostic logs** (`EXPO_PUBLIC_DEBUG_KEYBOARD=1`, `EXPO_PUBLIC_DEBUG_LIST_PERF=1`) without checking [plans/scroll-handling.md](plans/scroll-handling.md) §14 — load-bearing for future regression triage.
- **Don't write multi-line JSDoc / planning comments in source.** One-line inline comments only when *why* non-obvious. Plan file holds prose.
- **Don't add features beyond task.** No speculative abstractions, no "while I'm here" cleanups. Big files big because hard to safely modify, not sloppy.
- **Don't add backwards-compatibility shims** for code you're replacing in same PR. Delete old path; don't leave dead branches.
- **Don't update reanimated mock partially.** All worklet symbols MessageList imports must be present (`useAnimatedReaction`, `scrollTo`, `Extrapolation`, etc.). See [src/__mocks__/reanimated.js](src/__mocks__/reanimated.js).

## Planned Refactors (Don't Pre-Empt)

Plan at [/Users/kirby/.claude/plans/what-s-the-best-way-twinkly-allen.md](/Users/kirby/.claude/plans/what-s-the-best-way-twinkly-allen.md) sequences:

- **Layer 2** — extract `scrollAnchor.ts`, `mvcpGate.ts`, `streamState.ts` as pure reducers under `src/lib/chat/` with `fast-check` property tests.
- **Layer 3** — Maestro E2E flows in `.maestro/` for visual/timing regressions unit tests can't catch.

Asked to refactor scroll/MVCP/stream code → propose extraction per layer plan, not ad-hoc cleanup.

## Pointers

- [plans/scroll-handling.md](plans/scroll-handling.md) — canonical scroll/MVCP/keyboard reference. 14 sections + bug catalog.
- [plans/haptics-inventory.md](plans/haptics-inventory.md) — haptics surface inventory.
- [/Users/kirby/.claude/plans/what-s-the-best-way-twinkly-allen.md](/Users/kirby/.claude/plans/what-s-the-best-way-twinkly-allen.md) — 4-layer regression-prevention strategy (Layer 1 + 4 landed).
- [biome.json](biome.json) — lint-only config (formatter + assist disabled).
- [jest.config.js](jest.config.js) — two-project setup.
- [src/__mocks__/reanimated.js](src/__mocks__/reanimated.js) — Jest mock for reanimated. Update when MessageList imports new symbols.
- [patches/@shopify+flash-list+2.0.2.patch](patches/@shopify+flash-list+2.0.2.patch) — MVCP threshold-clear fix. Re-validate on any FlashList bump.
- `EXPO_PUBLIC_DEBUG_KEYBOARD=1` / `EXPO_PUBLIC_DEBUG_LIST_PERF=1` / `EXPO_PUBLIC_DEBUG_ITEM_HEIGHTS=1` — diagnostic logging flags.

## Style

- One-line comments only when *why* non-obvious. No multi-line JSDoc.
- Reference files inline as [filename.ts:42](src/filename.ts#L42) in chat/PRs. Plan file already does this.
- No emojis in code or commits unless explicitly requested.
- Commit subjects: `type(scope): short summary` (see `git log` for examples — `feat:`, `fix:`, `chore:`, `docs:`).