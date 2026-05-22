# Scroll Handling Reference

**Read this before changing any scroll behavior in the chat.**

Scroll behavior in `MessageList` has many imperative paths with overlapping triggers. Changes to one path easily regress others. This doc enumerates every programmatic scroll, every decision gate, and every ref/state involved, plus the user-facing contracts each path must preserve.

If you add a new scroll path, add a row to §2.

---

## 1. Scroll Owners

| Owner | File | Responsibility |
|---|---|---|
| `MessageList` (FlashList/FlatList) | `src/components/chat/MessageList.tsx` | All list scroll: send-anchor, pin-to-bottom, reveal, near-bottom detection |
| `ChatScreen` | `app/index.tsx` | Triggers reveals on annotation create; keyboard-show scroll-if-near-bottom; FocusModeScrollGuard |
| `FocusModeScrollGuard` | `app/index.tsx:93-125` | 200ms-delayed re-sync after focus-mode chrome animation |
| `pinToBottom.ts` | `src/components/chat/pinToBottom.ts` | Pure latch decision (`force` vs `nearBottom`) |
| `computeBottomSpacer.ts` | `src/components/chat/computeBottomSpacer.ts` | Top + bottom spacer heights (anchor space, short-chat bottom-pin) |
| `sendScrollTarget.ts` | `src/components/chat/sendScrollTarget.ts` | Computes send-anchor target offset/index |
| `pillState.ts` | `src/components/chat/pillState.ts` | New-message pill visibility (`!nearBottom && lastIsAssistant`) |

---

## 2. Programmatic Scroll Catalog

Every `listRef.current?.scrollTo*` call. If you add another, add a row here.

| # | Behavior | Site | Method | Trigger | Guard |
|---|---|---|---|---|---|
| 1 | Send-anchor | `MessageList.tsx:500-635` | `scrollToOffset` → `scrollToIndex({viewPosition:0})` → `scrollToEnd` | Fresh user message at tail | !skeleton, !resetting, !topSpacer |
| 2 | Scroll-to-bottom pill | `MessageList.tsx:638-642` | `scrollToOffset` or `scrollToEnd` | User taps pill | None |
| 3 | scrollToMessageId | `MessageList.tsx:1087-1092` | `scrollToIndex({viewOffset:32})` | Imperative handle | Index must exist |
| 4 | scrollToAnnotationId | `MessageList.tsx:1093-1133` | `measureLayout` + `scrollToOffset(y-24)` | Imperative handle (pill cycle) | Retry next frame |
| 5 | revealSectionForAnnotation | `MessageList.tsx:1211-1260` (driver) / `armPendingReveal` at `1189-1196` | `scrollToOffset` + kb-aware math | `useKeyboardHandler` worklet per-frame while `pendingRevealRef` set; immediate RAF if keyboard already up | Worklet guard list (see §7) |
| 6 | revealMessageBottom | `MessageList.tsx:1137-1185` | `scrollToOffset` or `scrollToIndex({viewPosition:1})` | FocusModeScrollGuard, annotation enter | `force:true` bypasses near-bottom |
| 7 | scrollToBottomIfNearBottom | `MessageList.tsx:1197-1200` | Delegates to scrollToBottom | FocusModeScrollGuard exit (composer-focus path now goes through worklet → `scrollToMessagesEnd`, see §7 Path A) | `isNearBottomRef === true` |
| 8 | Pin-to-bottom latch consume | `MessageList.tsx:937-1006` | `scrollToMessagesEnd(false)` | `onContentSizeChange` after armed latch | `!isUserDragging && shouldFirePinLatch()` |
| 9 | Defensive post-skeleton scroll | `MessageList.tsx:724-807` | `scrollToMessagesEnd(false)` | 2× RAF after session change / skeleton dismissal | `hadSkeleton \|\| force-latch survived` |
| 10 | Reset snap-to-end | `MessageList.tsx:702-719` | `scrollToEnd({animated:false})` | `isResetting === true` | Reset-only |
| 11 | Worklet keyboard sync (Path A + B) | `MessageList.tsx:1052-1079` | Routes to `scrollToMessagesEnd` (Path A) or `revealSectionRef` (Path B) per frame | `useKeyboardHandler` onStart/onMove/onEnd → `runOnJS(onKeyboardFrame)` | `!isResetting && pinToBottomRef===null && !inPinWindow && !needsAnchorSpace` |

---

## 3. Pin-to-Bottom Latch — Arm Sites

The latch is the single mechanism for "scroll to bottom once content lands". Arm it; don't call `scrollToEnd` directly from outside `MessageList`.

| Site | Arm Type | Why |
|---|---|---|
| `MessageList.tsx:648-655` (sessionKey effect) | `force:true` | Always land at bottom on session switch/cold start |
| `MessageList.tsx:657-669` (historyLoading rising edge) | `force:true` | History refresh — user explicit reload intent |
| `MessageList.tsx:817-837` (status message arrival) | `force:false` | Re-pin only if user already near bottom |

Consumed by `onContentSizeChange` at line 895 if `shouldFirePinLatch(latch, nearBottom)` returns true AND user is not actively dragging. 200ms safety timer at lines 636-644 fires unconditionally if not consumed (prevents stuck-armed latch).

**Pin window (`pinUntilTsRef`)** — a separate mechanism layered on top of the latch. While `Date.now() < pinUntilTsRef.current` OR `skeletonActiveRef.current === true`, every `onContentSizeChange` calls `scrollToMessagesEnd(false)` regardless of near-bottom state (skipped only while user is actively dragging). Armed for 5000ms at two sites: (a) sessionKey effect (`MessageList.tsx:673`) — bumped from 1500ms after observing dt=2704ms between sessionKey arm and big-history `onContentSizeChange` (skeleton dismissal had already closed the window), (b) skeleton-dismissal RAF (`MessageList.tsx:776`, uses `Math.max` so it never shortens an existing window). The `skeletonActiveRef` bypass guarantees re-pin on any onContentSizeChange while the skeleton overlay is mounted, regardless of clock time — user can't see the list anyway, so post-fade landing must be at bottom. Closes naturally on `onScrollBeginDrag` (user finger-down zeroes the window). On FlashList this is largely redundant with `autoscrollToBottomThreshold: 1` — its remaining job is to catch shrink events while user is at bottom (MVCP only auto-pins on growth), to drive the FlatList fallback path, and to cover the skeleton-bridge case where MVCP is disabled because `needsAnchorSpace=true`.

---

## 4. Decision Gates

- `isNearBottomRef.current` — true if `distFromEnd < layoutH * NEAR_BOTTOM_FRACTION (0.15)`. Updated on every `onScroll` and `onContentSizeChange`. Read by: pill, pin-consume, `scrollToBottomIfNearBottom`, `revealMessageBottom` (when `!force`), worklet Path A.
- `isUserDraggingRef.current` — true between `onScrollBeginDrag` and `onScrollEndDrag`. Pin-consume skips while true (don't fight active drag).
- `pinToBottomRef.current` — current latch (or null). Pure decision in `pinToBottom.ts`. Also part of the worklet guard list — worklet does nothing while a latch is armed.
- `keyboardHRef.current` — current keyboard height from `useKeyboardHandler` worklet (updated every frame of the show/hide animation, not just on show). Read by `revealSectionForAnnotation` on every platform — the iOS exclusion was removed (see §7 Path B). Also gated on by `armPendingReveal` to decide whether to immediate-fire vs. wait for worklet ticks.
- `composerFocusFlagRef.current` — true between `notifyComposerFocus()` call and the `onEnd` of the next keyboard animation. While true, worklet Path A calls `scrollToMessagesEnd(false)` per frame if `isNearBottomRef.current === true`. Owned by `MessageList` — `app/index.tsx` only sets it indirectly via `handleComposerFocus`.
- `pendingRevealRef.current` — `{ annotationId, messageId }` or null. Set by `armPendingReveal()` (and also re-set inside `revealSectionRef`). Consumed each worklet frame via Path B. Cleared on worklet `onEnd` and on session-key change.
- `needsAnchorSpaceRef.current` — ref mirror of the computed `needsAnchorSpace` value (assigned every render at `MessageList.tsx:384-385`). Part of the worklet guard list — prevents trampling send-anchor and streaming-tail position.
- `sendAnchorPending` — true during send-anchor animation (~300ms). Suppresses activity pill pulse to avoid overlap.
- `baselineLayoutHRef.current` — pre-kb layoutH snapshot. Updated in `onKeyboardFrame` whenever current layoutH exceeds prior baseline. Path A (`scrollTailFromBaseline`) uses `baseLh - height` as effective viewport so it can track the kb rise even when `KeyboardAvoidingView`'s `layoutH` update lags one frame behind the kb height. Cleared on worklet `onEnd` via `clearKeyboardBaseline`.
- `armBaseLayoutHRef.current` — layoutH at the moment `armPendingReveal` was called. Used by `correctiveEndScroll` as the gate: Path B's corrective fallback only fires if baseline has grown since arm AND a final kb height was captured AND no per-frame Path B scroll already landed. Prevents double-firing when chained annotations or composer-focus dual-flag the worklet.
- `cachedRevealMeasureRef.current` — `{ y, h }` of the annotation row's `measureLayout`, captured once on `armPendingReveal`. Path B's per-frame body uses these cached coords instead of running `measureLayout` per worklet tick (would otherwise queue async layout requests during the kb animation, landing all callbacks at the end as a visible flurry of scrolls). Cleared on `onEnd`.
- `finalKbHeightRef.current` — latest non-zero kb height observed in `onKeyboardFrame`. Used by `correctiveEndScroll` to know what the kb actually rose to (some scenarios emit `onEnd(0)` even after a real rise). Cleared on `clearKeyboardBaseline`.
- `revealScrolledOnceRef.current` — sticky boolean set to true on the first Path B per-frame scroll. `correctiveEndScroll` reads it to decide whether to invoke the legacy `revealSectionRef.current(...)` fallback (only when the worklet never scrolled — e.g. kb-already-up race).
- `annotationFocusActive` (prop, latched in parent) — passed into MessageList from `app/index.tsx`. True→false transitions are deferred until `keyboardDidHide` in the parent so the focus-mode chrome stays mounted during the kb-hide animation. See §7 "Focus-mode exit defer".

---

## 5. Spacers

| Spacer | File | Purpose | Height |
|---|---|---|---|
| Bottom spacer | `MessageList.tsx:354-376` | Allow user message to scroll to viewport top (anchor space) | `needsAnchorSpace ? layoutH : 0` (anchor active when streaming bubble or lastIsUser) |

Only one spacer remains. Top spacer was removed — short chats render messages at the top of the chat window, not pinned to the bottom. Bottom spacer feeds into `onContentSizeChange` math via `spacerHeightRef.current`. If you change spacer logic, audit every scroll target offset.

---

## 6. maintainVisibleContentPosition (MVCP)

- FlashList: 4-branch decision (`MessageList.tsx:954-966`) —
  - `historyLoading` → `{ autoscrollToTopThreshold: 0 }`
  - `needsAnchorSpace` (lastIsUser OR assistant streaming) → `{ autoscrollToBottomThreshold: -1 }` (disable sentinel)
  - `annotationFocusActive` → `{ autoscrollToBottomThreshold: -1 }` (disable during chrome collapse + kb rise)
  - else → `{ autoscrollToBottomThreshold: 1 }`
- FlatList fallback: `{ minIndexForVisible: 0 }` when `historyLoading`, else `undefined`.

**Patched dependency.** FlashList 2.0.2 has a bug in `useBoundDetection.runAutoScrollToBottomCheck` — flipping `autoscrollToBottomThreshold` to -1 mid-flight doesn't clear the armed `pendingAutoscrollToBottom` flag (the check early-returns when threshold<0 without clearing). A subsequent `windowHeight`/data change then fires `scrollToEnd` against the new threshold-disabled state. Patched in `patches/@shopify+flash-list+2.0.2.patch` to honor the live threshold and clear the armed flag when threshold goes <0. Without the patch, the `annotationFocusActive` and `needsAnchorSpace` MVCP-off branches don't actually disable autoscroll if it was armed before the flip. `patch-package` runs via `postinstall` hook.

**During history-load:** keep visible content stationary while older messages prepend (`autoscrollToTopThreshold: 0`).

**During anchor mode (`needsAnchorSpace`):** MVCP bottom-pin is disabled. Send-anchor owns scroll position while the tail is a user message awaiting response or the assistant is streaming. Without this gate, MVCP's 1px native pin fires on the send moment itself (user was within 1px of empty/full bottom before send), pulling the list past the new user message before send-anchor's 3× RAF buffer completes.

**During annotation focus mode (`annotationFocusActive`):** MVCP bottom-pin is disabled. Focus-mode chrome collapse grows layoutH ~84px BEFORE the kb begins rising; FlashList's native MVCP autoscroll would otherwise re-anchor the tail on that windowHeight change, fighting Path B's per-frame reveal target. The patched `runAutoScrollToBottomCheck` clears the armed flag when threshold flips to -1 mid-flight, so the disable is honored even if MVCP was armed from a pre-focus streaming event.

**Trade-off accepted:** during streaming the user cannot passively follow the tail at bottom — they must manually drag down each time the tail grows out of view. No JS-side replacement; the simpler MVCP-off semantics won over a custom follow latch.

**Outside history-load and outside anchor mode (FlashList only):** when the user is within 1px of bottom, FlashList natively re-pins to the new bottom on each measurement event (markdown reflow, code highlight, image load) — no JS round trip. Threshold = 1px is intentionally conservative; only fires when the user is literally at the tail. Replaces the per-event JS-side `scrollToEnd` that used to flicker after every `onContentSizeChange`. Active scenarios: tool-call group expansion/collapse on a completed assistant tail, status messages, image lazy-load.

---

## 7. Keyboard Coordination

Two scroll paths share a single `useKeyboardHandler` worklet in `MessageList.tsx:1070-1079`. The worklet fires on every frame of the iOS/Android keyboard animation (`onStart`/`onMove`/`onEnd`) and routes via `runOnJS` to `onKeyboardFrame` (`MessageList.tsx:1052-1068`), which mirrors `event.height` into `keyboardHRef.current` and then services whichever path is active. This replaces the prior `KeyboardEvents.addListener('keyboardDidShow', ...)` block that fired only *after* the keyboard finished animating — the worklet drives scroll in lockstep with the rise/fall.

**Common guard list** (worklet does nothing if any of these are true):

- `isResettingRef.current`
- `pinToBottomRef.current !== null`
- `Date.now() < pinUntilTsRef.current`
- `needsAnchorSpaceRef.current`

**Path A — composer focus → re-anchor tail per frame**

- `handleComposerFocus()` in `app/index.tsx` calls `messageListRef.current?.notifyComposerFocus()`.
- `notifyComposerFocus` sets `composerFocusFlagRef.current = true`.
- Worklet body (`onKeyboardFrame`): when flag is set AND `isNearBottomRef.current === true` AND no `pendingRevealRef` is active, call `scrollTailFromBaseline(height)` each frame.
- `scrollTailFromBaseline` (`MessageList.tsx:1195-1214`) computes the target offset as `contentH - spacerH - effLh` where `effLh = min(baseLh - height, layoutH)`. The baseline subtraction matters because `KeyboardAvoidingView`'s `layoutH` update lags one frame behind the kb height during iOS rise — reading `layoutH` directly would briefly compute a too-large viewport and overshoot. `baselineLayoutHRef` is captured on the first onKeyboardFrame of the rise (`MessageList.tsx:1070-1073`).
- Flag cleared by `clearComposerFocusFlag` on `onEnd`. Refs cleared by `clearKeyboardBaseline`.
- Use case: normal compose. Tail follows keyboard rise in one continuous motion — no post-animation snap.

**Path B — reveal annotation card above keyboard**

- New annotation created → effect in `app/index.tsx` (rising-edge guarded by `prevAnnotationsLengthRef`) calls `messageListRef.current?.armPendingReveal(newest.id, newest.messageId)`.
- `armPendingReveal` does three things synchronously:
  1. Sets `pendingRevealRef.current`.
  2. Captures `armBaseLayoutHRef.current = layoutHRef.current` (gate for `correctiveEndScroll`).
  3. Runs `rowView.measureLayout(scrollNode, ...)` once and caches the result into `cachedRevealMeasureRef.current = { y, h }`. The per-frame worklet body uses these cached coords — calling `measureLayout` per worklet tick would queue async layout requests that all flush at the end of the kb animation, producing a visible flurry of late scrolls.
  4. If `keyboardHRef.current > 0` (kb already up — chained annotations), schedules one RAF call to `revealSectionRef.current(...)` so reveal fires without waiting for a kb event.
- Worklet body (`onKeyboardFrame`): when `pendingRevealRef.current` is set AND `cachedRevealMeasureRef.current` is populated, compute the target inline from cached coords + live `layoutH` + live `kb` height + `COMMENT_REVEAL_PILL_OBSTRUCTION`, then call `listRef.current?.scrollToOffset({ offset, animated: false })`. The math reads the current `layoutH`, so the target tracks the kb rise even while `KeyboardAvoidingView` is shrinking the layout. `animated: false` per tick — each frame snaps to the recomputed target so iOS isn't restarting a 300ms scroll-animation curve 16× over the rise. Smoothness comes from per-frame tracking, not from the native animator. The one-shot immediate-fire path from `armPendingReveal` and the imperative-handle method keep the default `animated: true` (single smooth scroll to the destination).
- Sets `revealScrolledOnceRef.current = true` on the first per-frame fire. `correctiveEndScroll` reads this to decide whether the legacy `revealSectionRef.current(...)` fallback is needed (only if the worklet never scrolled — kb-already-up race).
- `pendingRevealRef` cleared by `clearPendingReveal` on `onEnd` and on session-key change. Cached measure + baseline refs cleared by `clearKeyboardBaseline`.
- iOS note: the per-frame math subtracts `kb` from `usableH` on every platform. If a device shows over-scroll on iOS, suspect double-counting against `KeyboardAvoidingView`'s shrink.

**Path B native-clamp guard — `FOCUS_MODE_CONTENT_INSET`**

- `MessageList.tsx:77`. While `annotationFocusActive` is true, pass `contentInset={{ bottom: 120 }}` to FlashList.
- Why: when chrome collapses (focus mode enter), layoutH grows BEFORE Path B's first per-frame scroll lands. iOS UIScrollView clamps `contentOffset` to `contentH - layoutH + contentInset.bottom`. Without the inset, the first 1–2 frames of Path B can target an offset above the iOS-allowed max, producing a visible snap-back as iOS overrides Path B's scroll request mid-frame.
- Inset value 120 chosen empirically: large enough to absorb worst-case chrome growth (~84px) with margin, small enough to avoid iOS auto-adjusting `contentOffset` on inset apply (observed Δ+396 jump with inset=500 on focus enter — iOS auto-adjusts when inset.bottom grows by a large amount).
- Reverts to `undefined` when `annotationFocusActive` flips false. The flip itself is deferred to `keyboardDidHide` (see "Focus-mode exit defer" below).

**Path B corrective end-scroll — `correctiveEndScroll`**

- `MessageList.tsx:1317-1342`. Runs on worklet `onEnd` via `runOnJS`.
- Two responsibilities:
  1. If `pendingRevealRef` was set but `revealScrolledOnceRef === false` (kb-already-up race where the worklet never fired), invoke `revealSectionRef.current(annotationId, messageId, true)` as the fallback. Logged as `corrective FALLBACK` in debug.
  2. If Path A's `composerFocusFlagRef` was set and we're near bottom, fire `scrollToMessagesEnd(false)` as a final settle.
- Path B path is gated on `revealScrolledOnceRef` so we don't double-fire when the worklet already scrolled.

**Focus-mode exit defer**

- Done tap fires `exitAnnotationFocusMode` in `app/index.tsx`. Without deferral, this synchronously flips `annotationFocusActive` false, which collapses the focus-mode chrome (`CollapsingChatHeader` + InputBar collapses) in the same tick. FlashList layoutH grows ~227px instantly, iOS UIScrollView clamps `contentOffset` by the overflow amount (observed Δ-478), producing a visible snap mid-kb-hide.
- Fix (`app/index.tsx`): `annotationFocusActiveRaw = targetAnnotationId !== null && annotationComposerFocused`. A latched mirror `annotationFocusActiveLatched` holds true through the true→false transition until `KeyboardEvents.addListener('keyboardDidHide', ...)` fires (500ms safety timer covers the case where kb wasn't actually visible).
- The same finish callback also performs the deferred state clears (`setTargetAnnotationId(null)`, `setAnnotateMessageId(null)`), gated on `exitIntentRef.current` which `exitAnnotationFocusMode` sets. Mid-defer re-engagement (user re-taps an annotation) flips raw back to true, clears the intent, and the effect cleanup cancels the pending finish — so re-entering focus before kb-end doesn't clobber state.
- `annotationFocusActiveLatched` is fed into:
  - `<AnnotationDraftProvider composerFocused={annotationComposerFocused || annotationFocusActiveLatched}>` — keeps `useIsAnnotationFocusActive()` returning true during defer window, so `CollapsingChatHeader` and `FocusModeScrollGuard` see active.
  - `<MessageList annotationFocusActive={annotationFocusActiveLatched}>` — keeps the MVCP gate, the contentInset, and the `useLayoutEffect` post-exit anchor consistent with the parent's view.
- Trade-off: chrome unmounts AFTER kb-end, so the layout grow + iOS clamp happens with the kb already gone. User sees "kb hides cleanly, then chrome collapses + chat settles" rather than "chat snaps mid-kb-hide". The post-exit `useLayoutEffect` in MessageList (`MessageList.tsx:1160-1170`) requests an animated `scrollToOffset(currentOffset + 2000)` on the latched flip; iOS clamps the animation target to the new max as layout commits, polishing the residual motion. iOS still wins the instant-clamp race vs. our scrollToOffset, but at least the kb is no longer animating.

**Boundary rule:** Path A scrolls to tail; Path B scrolls to a specific row above keyboard. Flags are independent and both can be set in the same worklet tick — Path B takes precedence (Path A's per-frame fire is gated on `!p` at `MessageList.tsx:1289`). The boundary used to be theoretical (annotation implies composer focus has already moved) but the explicit gate is load-bearing now that both refs can co-occur during the deferred-exit window.

**`useReanimatedKeyboardAnimation`** in `InputBar.tsx:198` is unrelated — it drives only the InputBar's own `paddingBottom` interpolation. No conflict with the worklet here.

---

## 8. FocusModeScrollGuard

`app/index.tsx:93-125`. Fires 200ms after annotation focus mode toggles (header collapse + InputBar header collapse settle via `CollapseWhen` 150ms animation).

- Enter focus: `revealMessageBottom(annotateId, { force: true })` — bring message metadata row above keyboard.
- Exit focus: `scrollToBottomIfNearBottom(true)` — re-sync if user was at bottom.

`CHROME_SETTLE_MS = 200` constant. Do not shorten without re-measuring chrome animation duration.

---

## 9. Expected Behavior Contracts

These are the user-facing invariants. Any scroll change must preserve them.

**Cold start / app switch / session load / session switch (first-time view)**
- List appears already scrolled to bottom. No flash of top content. No post-load animated scroll.
- Mechanism: `sessionKey` effect arms `force:true` latch; either `onContentSizeChange` or the 2× RAF defensive scroll at line 738 fires `scrollToMessagesEnd(false)` before user sees content.
- Known bug: see Bug #1 below.

**Mid-conversation user submit**
- User message scrolls to ~top of viewport (anchored ChatGPT-style); ~3 lines of prior turn visible above as "context band"; agent response streams in below.
- Position holds through stream start. For at-bottom sends (`!wasScrolledUpAtSend`), `contentH`/`spacerH`/`activityPad` are snapshotted in RAF frame 2 (post user-msg `onContentSizeChange`, pre-streaming) so a fast-network streaming bubble arriving before frame 3 can't inflate the offset. For scrolled-up sends, refs are read fresh in RAF frame 3 — the off-screen tail needs the full 3-frame window before `onContentSizeChange` fires with correct height.
- The send moment itself does NOT auto-pin to bottom. MVCP bottom-pin is gated off while `needsAnchorSpace` is true (lastIsUser OR streaming).
- During streaming the tail does NOT auto-follow either — user must manually drag down to follow new tokens. Accepted trade-off; "New messages" pill still indicates content below the fold.
- "New messages" pill appears with pulsing dot when assistant output lands while user is scrolled away.

**Empty / short conversation**

- Messages render at the top of the chat window. No bottom-pinning. (Top spacer was removed.)
- Send-anchor activates only when content overflows the viewport — for short chats that still fit, no programmatic scroll is fired on send.

**Composer focus (tap input bar)**

- Keyboard rises and the tail tracks the keyboard rate in one continuous motion if user was already near the bottom. No post-animation snap.
- If user is scrolled away from the tail, no programmatic scroll fires (gated by `isNearBottomRef` inside the worklet — viewport just shrinks under them).
- Mechanism: `useKeyboardHandler` worklet, Path A in §7.

**Annotation mode enable (long-tap or pill button)**
- No automatic scroll. Annotate chrome (`AddCommentRow`, annotate-mode indicator) reveals inline. If user is near a message bottom, `FocusModeScrollGuard` later brings the metadata row into view via `revealMessageBottom` with `force:true` once focus enters.
- Expected: scroll toward bottom of message section the user is near, OR to bottom of message/chat if user is near the bottom — so metadata row is visible.

**"Add a comment" tap**
- Keyboard appears.
- Comment preview card (`InlineAnnotationRow`) and message metadata row land visibly above input bar.
- Expected: single smooth motion synchronized with keyboard animation. No pre-keyboard scroll jank followed by post-keyboard re-scroll. No iOS UIScrollView snap-back during the rise (Path B's per-frame target must stay within iOS's allowed offset range — `FOCUS_MODE_CONTENT_INSET` extends the legal range to absorb chrome-collapse overflow).
- Mechanism: `useKeyboardHandler` worklet, Path B in §7. Cached `measureLayout` snapshot taken at `armPendingReveal` time and reused per frame (no async measure queueing during the rise).
- Previously known bug fixed — see Bug #2 below.

**"Done annotating" tap (exit focus mode)**
- Keyboard hides smoothly.
- Focus-mode chrome (collapsed header, InputBar collapses) stays mounted through the kb-hide animation — does NOT collapse mid-hide.
- After kb fully hidden, chrome unmounts and chat list settles at the post-collapse bottom offset. A small post-exit settle is acceptable; a mid-kb-hide instant snap is not.
- Mechanism: `annotationFocusActiveLatched` mirror in `app/index.tsx` defers the true→false flip until `keyboardDidHide`. State clears (`targetAnnotationId`, `annotateMessageId`) deferred to the same event. `useLayoutEffect` in MessageList fires an animated `scrollToOffset` on the latched flip to polish residual motion. See §7 "Focus-mode exit defer" and Bug #7.

**Comment save (send in annotation target mode)**
- Comment text saved to annotation.
- Keyboard stays open. Annotation mode stays active. No scroll.
- Keyboard dismisses only when: (a) message sent via main send button or preview modal, (b) "Done" tapped, (c) "Clear all" tapped.
- Known bug: see Bug #3 below.

**Scroll/drag while annotation active**
- Does not dismiss keyboard or exit annotation mode. User can scroll freely while comment composer is focused.
- Known bug: see Bug #3 below.

---

## 10. When Changing Scroll Behavior — Checklist

Before merging any scroll-affecting change, verify each contract in §9 manually:

- [ ] Cold start lands at bottom (kill app → open → first session visible at tail)
- [ ] Session switch lands at bottom (sidebar → switch → tail visible, including slow-load skeleton case — verify `pinUntilTsRef` 5000ms window + skeleton bypass covers dt > 1500ms history payloads)
- [ ] User submit scrolls message to top with context band — and position holds through stream start, no upward overshoot
- [ ] No auto-pin on the send moment itself (MVCP gated by `needsAnchorSpace`)
- [ ] Streaming does NOT auto-follow tail — user must drag manually
- [ ] "New messages" pill appears + pulses correctly
- [ ] Short conversation renders messages at top of chat window (no bottom-pin); send-anchor only fires once content overflows
- [ ] Annotation pill cycle scrolls to target annotation
- [ ] Add-comment shows card above keyboard in single motion
- [ ] Save comment keeps keyboard open
- [ ] Drag during annotation keeps keyboard open (suppressKeyboardDismissOnScroll wired)
- [ ] History refresh re-pins to bottom
- [ ] Reset session lands at top of viewport (accepted limitation — reset marker intentionally suppressed)
- [ ] Composer focus at tail → keyboard rises, tail tracks keyboard rate in one continuous motion (no post-rise snap)
- [ ] Composer focus mid-history → keyboard rises, list does NOT auto-scroll (gated by `isNearBottomRef` inside worklet)
- [ ] Add-comment near top / middle / bottom of viewport → reveal lands above keyboard in single motion (no pre-keyboard jank); verify iOS landing offset is correct (no double-count vs `KeyboardAvoidingView`); no iOS instant-snap during the rise (cached measure + `FOCUS_MODE_CONTENT_INSET` should absorb)
- [ ] Chained annotations (keyboard already up) → second/third annotation reveal fires synchronously via `armPendingReveal` immediate-fire branch
- [ ] Keyboard dismiss via swipe-down gesture → no animated scroll, refs return to zero via worklet `onEnd`
- [ ] "Done annotating" tap → kb hides smoothly; chrome stays mounted through the entire kb-hide animation; chrome collapse + chat settle happens AFTER kb fully hidden, not during; no mid-hide Δ-300+ snap
- [ ] Mid-defer re-engagement → tap Done, immediately tap another annotation before kb finishes hiding → focus mode stays engaged on the new target, state is NOT cleared by the pending finish (intent ref + effect cleanup must cancel)
- [ ] Done flow with kb already hidden (e.g. user swiped kb down then tapped Done) → state clears via 500ms safety timer (keyboardDidHide doesn't fire when kb wasn't visible)
- [ ] FlashList patch present (`patches/@shopify+flash-list+2.0.2.patch`) and applied by `patch-package` postinstall — verify `node_modules/@shopify/flash-list/dist/recyclerview/hooks/useBoundDetection.js` contains the threshold-clear PATCH block

---

## 11. Glossary

- **Send-anchor**: ChatGPT-style scroll that places newly-submitted user message ~top of viewport, not bottom.
- **Pin-to-bottom latch**: Deferred scroll request that fires when next `onContentSizeChange` event arrives with measured geometry.
- **Near-bottom**: Within 15% of viewport from end of content (`NEAR_BOTTOM_FRACTION = 0.15`).
- **Reveal**: Targeted scroll to a specific row (annotation or message bottom), often keyboard-aware.
- **Focus mode**: State where annotation composer has focus; collapses chrome (header, InputBar header) to maximize visible chat area.

---

## 12. Known Bugs

Catalog of current scroll/annotation bugs with prescribed fixes. Implement each in a separate pass; do not bundle unrelated bugs. Line numbers reflect the state of the codebase at the time this doc was written — re-grep before editing.

### Bug #1 — Cold start / session load: chat appears at top

**Symptom:** On cold start / app switch / session load / session switch (first time viewing a session), chat appears scrolled to top instead of bottom.

**Status:** Significantly mitigated. Three upstream changes removed the dominant churn sources:
- Stable message ids — `chat.ts:60` now reads `__openclaw.id` (server-stable hex); `messageMerge.ts` adds composite-key identity recovery `(role, timestamp, content)` so messages cached under older random ids adopt the canonical id on the next merge instead of remounting all 15+ cells.
- `ToolCallGroup` auto-collapse — `ToolCallGroup.tsx:38-40` now initializes `autoCollapsed` lazily from `allDone` so groups that mount already-completed (history load) don't fire the 2.5s expand→collapse animation that was shrinking each completed group by ~96px during settle.
- Pin window extension — bumped sessionKey `pinUntilTsRef` from 1500ms to 5000ms and added `skeletonActiveRef` bypass in `onContentSizeChange.inPinWindow`. Covers the observed dt=2704ms gap between sessionKey arm and big-history `onContentSizeChange` for slow-loading sessions with skeleton overlay.

Contract change: short conversations no longer pin to bottom — they render messages at the top of the chat window. Top spacer was removed entirely. This narrows Bug #1's scope to "list appears scrolled past the tail" rather than "list appears at top instead of bottom" for the short-conversation case (which is now the desired behavior).

Re-run the cold-start contract before assuming any Mode A/B/C fix below is still needed. Mode B (stale offsetY + remount) is the most directly addressed.

**Likely root cause (one of three modes):**

- Mode A — Latch fires under splash/skeleton overlay (scroll succeeds but visually invisible, then geometry shifts when overlay dismisses).
- Mode B — `onContentSizeChange` fires with stale `offsetYRef.current` from previous session (latch consumed with wrong nearBottom calc).
- Mode C — Defensive 2× RAF scroll at `MessageList.tsx:732` runs before list layout stable, target offset is computed but list re-measures after, leaving final position above bottom.

**Investigation steps before fix:**
1. Enable `EXPO_PUBLIC_DEBUG_LIST_PERF=1` and capture cold-start `[ListPerf]` logs.
2. Add temporary log to `scrollToMessagesEnd` (`MessageList.tsx:604-618`) showing computed offset + contentH + layoutH + spacerH at each call site.
3. Identify which call lands "at bottom" and which lands short.

**Prescribed fix (most likely):**
- In `MessageList.tsx` skeleton-dismissal effect (lines 745-753), after `setSkeletonActive(false)`, schedule one more `scrollToMessagesEnd(false)` on next RAF. Skeleton overlay was hiding the list; geometry may have shifted between the early scroll at line 738 and the visible-list state.
- Also reset `offsetYRef.current = 0` in the sessionKey effect at `MessageList.tsx:648-655` so stale Y from prior session can't pollute `onContentSizeChange` math at line 884.

**Files to modify:** `src/components/chat/MessageList.tsx`

**Verification:** Kill app cold → open → confirm tail visible. Switch sessions from sidebar → confirm tail visible. Refresh history (pull-to-refresh or refresh button) → confirm tail visible.

---

### Bug #2 — Add-comment scroll jank during keyboard rise

**Status:** FIXED. Approach A taken — `useKeyboardHandler` worklet replaces the post-keyboard `keyboardDidShow` 2× RAF re-run. Reveal scroll now lands in lockstep with the keyboard rise via Path B in §7. iOS branch of `revealSectionRef` was also unified to subtract `kb` on every platform so per-frame calls land at the correct rising offset.

**Refinements since initial fix:**
- Worklet body computes target inline from `cachedRevealMeasureRef` instead of calling `revealSectionRef` (which would run `measureLayout` async per frame and queue callbacks that flush at the end of the rise as a visible flurry of scrolls). One `measureLayout` per `armPendingReveal`, cached for the duration of the rise.
- `FOCUS_MODE_CONTENT_INSET = { bottom: 120 }` applied to FlashList while `annotationFocusActive` to extend iOS's legal scroll range and absorb the chrome-collapse overflow that would otherwise trigger a UIScrollView instant-snap on the first 1–2 frames of Path B.
- `flashListMvcp` added 4th branch (`annotationFocusActive` → `{ autoscrollToBottomThreshold: -1 }`) to disable native MVCP autoscroll during chrome collapse — would otherwise fight Path B's per-frame target. Required patching FlashList 2.0.2 (`patches/@shopify+flash-list+2.0.2.patch`) so the live threshold flip clears the armed `pendingAutoscrollToBottom` flag.
- `baselineLayoutHRef` + `armBaseLayoutHRef` track pre-kb and arm-time layoutH so Path A's `scrollTailFromBaseline` and `correctiveEndScroll`'s fallback gate work correctly even when `KeyboardAvoidingView`'s `layoutH` update lags one frame.

**Symptom:** Tap "Add comment" → keyboard rises → list janks during rise → list smooth-scrolls again after keyboard fully visible. End state correct, transition janky.

**Root cause:**
- `app/index.tsx:582-592` fires `revealSectionForAnnotation` via single RAF immediately after annotation creation, before keyboard has begun animating.
- `revealSectionForAnnotation` reads `keyboardHRef.current` (still 0 if keyboard hasn't shown yet) — Android branch at `MessageList.tsx:1132-1134` so it scrolls assuming no keyboard.
- `keyboardDidShow` fires after keyboard fully visible → re-runs `pendingRevealRef` via 2× RAF → second scroll lands at correct position.
- Result: two scrolls; the second one overshoots the first.

**Prescribed fix:**

Use `react-native-keyboard-controller`'s `useKeyboardHandler` (worklet-based, fires on every frame of keyboard animation) to drive the reveal scroll in sync with the keyboard rise instead of scrolling pre-keyboard then re-scrolling post-keyboard.

- Approach A (preferred): in `MessageList.tsx`, replace the `KeyboardEvents.addListener('keyboardDidShow', ...)` block at lines 976-988 with a `useKeyboardHandler({ onMove, onEnd })` worklet that calls `revealSectionRef` with the current keyboard height each frame. Only fire if `pendingRevealRef.current` is set.
- Approach B (simpler): in `app/index.tsx:582-592`, do not call `revealSectionForAnnotation` immediately. Instead set `pendingRevealRef` (expose a setter on `MessageListHandle`) and let `keyboardDidShow` be the only trigger. Trade-off: ~250ms delay before scroll begins (waits for keyboard animation start).

**Files to modify:** `src/components/chat/MessageList.tsx`, `app/index.tsx`

**Verification:** Enable annotation mode on a message near top of viewport → tap "Add comment" → observe smooth single-motion scroll synchronized with keyboard rise. Repeat for message near middle and near bottom. iOS and Android.

---

### Bug #3 — Drag / save-comment cancels annotation mode + dismisses keyboard

**Status:** FIXED. `suppressKeyboardDismissOnScroll` prop drives `keyboardDismissMode="none"` while `targetAnnotationId !== null` (3a). `handleSend` annotation-target branch no longer calls `blur()` or `KeyboardController.dismiss()` (3b). Verified in simulator.

**Symptom:** While annotation comment composer is focused, scrolling/dragging the chat or saving the comment dismisses the keyboard and exits annotation mode. Should: stay in annotation mode, keep keyboard open.

**Root causes (two distinct sources):**

3a. Drag dismissal: `MessageList.tsx:873-876` unconditionally calls `onScrollUserDismiss?.()` on `onScrollBeginDrag`. Wired in `app/index.tsx:1133` as `onScrollUserDismiss={targetAnnotationId !== null ? exitAnnotationFocusMode : undefined}`. `exitAnnotationFocusMode` (`app/index.tsx:594-599`) clears `targetAnnotationId` + `annotateMessageId`, blurs input, dismisses keyboard.

3b. Save dismissal: `handleSend` annotation-target branch at `app/index.tsx:781-787` calls `inputBarRef.current?.blur()` + `KeyboardController.dismiss()` on save.

**Prescribed fix:**

3a — Remove the dismissal entirely (this was a previous design choice the user wants reverted).
- `app/index.tsx:1133`: pass `onScrollUserDismiss={undefined}` always (or remove the prop). Keep `isUserDraggingRef` updates in `MessageList.tsx` (still needed for pin-latch guard at line 895).
- Optional cleanup: remove the `onScrollUserDismiss` prop from `MessageListProps` if no other caller uses it.

3b — Remove the blur + dismiss calls in the save branch.
- `app/index.tsx:781-787`: drop `inputBarRef.current?.blur()` and `KeyboardController.dismiss()`. Keep `pendingAnnotationSaveRef.current = text` and `setTargetAnnotationId(null)`. The target-swap effect (lines 524-571) will swap the InputBar text back to prelude / next annotation comment without re-focus needed (composer keeps current focus).
- Verify: after save, keyboard stays open, composer text swaps to prelude, `targetAnnotationId` clears (back to "untargeted with annotations" mode 2).

Keyboard dismissal still happens on:
- Main send (mode 2 branch at lines 791-800) — already correct, `clearAnnotations` + `setAnnotateMessageId(null)` triggers focus-mode exit → keyboard dismiss via existing flow (verify).
- "Done annotating" — `handleAnnotate` at lines 601-609 already calls `blur()` + `KeyboardController.dismiss()` on exit branch.
- "Clear all" — `handleAnnotationClear` at lines 653-671 calls `exitAnnotationFocusMode()` which dismisses keyboard.
- Preview modal send — verify path; if it goes through `sendMessage` + `clearAnnotations` + `setAnnotateMessageId(null)`, keyboard exits the same as mode 2.

**Files to modify:** `app/index.tsx`, possibly `src/components/chat/MessageList.tsx` (prop cleanup)

**Verification:**
- Enable annotation mode → tap Add comment → keyboard appears → drag chat list up/down → keyboard stays open, annotation mode persists.
- Same setup → tap send → comment saves, keyboard stays open, InputBar text swaps to prelude (or empty if no prelude).
- Tap "Done annotating" → keyboard dismisses, mode exits.
- Tap "Clear all" → confirm → keyboard dismisses, mode exits.
- Tap main send while annotations exist (no edit target) → message sends, keyboard dismisses, mode exits.

---

### Bug #4 — Hide chevrons on annotation strip when only 1 saved comment

**Symptom:** `InputBarAnnotationStrip` always renders left/right chevrons; they're greyed out when only 1 annotation but still visually present.

**Root cause:** `src/components/input/InputBarAnnotationStrip.tsx:34` sets `chevronsDisabled = annotationCount <= 1` and the chevron Pressables render with greyed icons. User wants them fully hidden.

**Prescribed fix:**

In `InputBarAnnotationStrip.tsx`:
- Change the decision to use `effectiveBadgeCount` (already computed at line 28): `const chevronsHidden = effectiveBadgeCount <= 1;`.
- Wrap each chevron `<Pressable>` (lines 42-50 and 63-71) in `{!chevronsHidden && (...)}`.
- Remove the `chevronsDisabled` flag and the conditional `onPress` / pressed-opacity / muted-color logic — no longer needed since the buttons just don't render.
- Verify the centered `countRow` layout still looks balanced when chevrons are absent (label + badge centered between empty space where chevrons were vs. tight against eye/X actions). May need to wrap label+badge in a center View or adjust `justifyContent`.

**Files to modify:** `src/components/input/InputBarAnnotationStrip.tsx`

**Verification:**
- Add one annotation → strip shows label + badge "1" + eye + X. No chevrons.
- Add second annotation → chevrons appear, cycle works.
- Add empty draft (Add comment without typing) so `annotationCount=2` but `effectiveBadgeCount=1` → chevrons hidden (saved-only threshold matches the chosen semantics).

---

### Bug #6 — Composer focus → keyboard rise is two-stage, not synchronized

**Status:** FIXED. Approach A taken — `useKeyboardHandler` worklet drives `scrollToMessagesEnd(false)` per frame while `composerFocusFlagRef` is set and user is near bottom. See §7 Path A for the new wiring. `scrollOnKeyboardShowRef` + `KeyboardEvents.keyboardDidShow` listener block removed from `app/index.tsx`.

**Symptom:** Tap the input bar to focus the composer → keyboard rises and pushes the input bar up → list visibly snaps/scrolls to bottom *after* the keyboard finishes animating. Two stages visible. ChatGPT-style desired behavior: the chat content slides up at the exact rate the keyboard rises, in one continuous fluid motion. No post-animation snap.

**Root cause:**
- `app/index.tsx:491-507`. `handleComposerFocus()` sets `scrollOnKeyboardShowRef.current = true`. The `keyboardDidShow` listener reads + clears the flag, then calls `messageListRef.current?.scrollToBottomIfNearBottom(true)`.
- `keyboardDidShow` is the iOS event that fires *after* the keyboard animation completes — so the scroll runs once the keyboard is already fully up. The user sees: (1) keyboard animates in, content stays anchored to its original viewport bottom (now partially obscured), then (2) list animated-scrolls to bottom of the now-shorter viewport.
- The two stages are sequential, not synchronized.

**Prescribed fix:**

Approach A (preferred) — drive the list content offset in lockstep with keyboard height using `react-native-keyboard-controller`'s `useKeyboardHandler` (worklet, fires on every frame of the animation).

- In `MessageList.tsx`, register a `useKeyboardHandler({ onMove, onEnd })` worklet.
- Maintain a `keyboardHeight` shared value that mirrors `event.height` on every frame.
- Apply it as an extra bottom inset / `contentInset.bottom` (FlatList) or as a translate-Y on the inner container (FlashList), so the visible bottom of content shifts up in sync.
- The existing `keyboardDidShow` block at `app/index.tsx:495-499` can be removed: with the worklet driving the offset, no post-animation scroll is needed.
- Path B keyboard coordination (annotation reveal at `MessageList.tsx:976-988`) should be reviewed in the same pass — Bug #2's fix overlaps.

Approach B (simpler, may not feel as fluid) — wrap the chat + input in `KeyboardAvoidingView` (or `react-native-keyboard-controller`'s `KeyboardAvoidingView`). The container shrinks from the bottom as the keyboard rises; FlashList's scroll position remains anchored, so content visually shifts up with the keyboard. Trade-off: less control over edge cases (e.g. partial-near-bottom positions); requires verifying the input bar stays glued to the keyboard top and doesn't double-up with `KeyboardStickyView` if that's already in the tree.

**Files to modify:** `src/components/chat/MessageList.tsx`, `app/index.tsx`

**Verification:**
- Open a session at tail → tap input bar → observe keyboard rise: content should slide up at exactly the keyboard rate, last message stays in view at the same visual position, no post-keyboard snap.
- Scrolled away from tail → tap input bar → observe: content should NOT auto-scroll to bottom (that's the `isNearBottomRef` gate, still valid). Content slides up only enough that current scroll position stays valid above the keyboard.
- Tap input → keyboard hides → repeat: smooth reverse motion, no jump.
- iOS + Android.

---

### Bug #5 — Animate annotation UI disappearance on Clear All

**Symptom:** When user taps "Clear all" → confirms → annotation UI disappears abruptly with no transition.

**Root cause:** `InputBarAnnotationStrip` already has `exiting={FadeOutDown.duration(150)}` (line 39). However, `handleAnnotationClear` (`app/index.tsx:653-671`) calls `clearAnnotations()` then `exitAnnotationFocusMode()` synchronously — the latter resets `annotateMessageId` and dismisses keyboard, which may unmount the strip before Reanimated's exiting animation runs (or runs concurrently with other layout shifts, masking the fade).

Verify first: does the FadeOutDown actually play? If yes, the bug is about other elements (annotate-mode chrome on the message). If no, the bug is the parent unmounting too fast.

**Prescribed fix (verify-then-apply):**

Step 1 — Verify current behavior:
- Add a temp log inside `InputBarAnnotationStrip` (via `useEffect` cleanup) to confirm whether the component unmounts smoothly or abruptly.
- Run "Clear all" flow on simulator with slow-animations enabled (Cmd+T on iOS sim, Developer Options on Android).

Step 2 — Likely fix if strip unmounts abruptly:
- The strip is conditionally rendered via the parent (`InputBar.tsx`) based on `annotationCount > 0`. Reanimated `exiting=` requires the component to remain mounted in the React tree for one frame after exit animation. If `clearAnnotations()` immediately drops `annotationCount` to 0 and the parent removes the strip, no exit time.
- Wrap the strip in `<Animated.View>` at the parent level with `exiting` driven by Reanimated's exit driver.
- Simpler: in `handleAnnotationClear`, schedule the state resets in a `setTimeout(..., 150)` after `clearAnnotations()` so the exiting animation has time to play. Trade-off: brief delay before keyboard dismisses, may feel sluggish.
- Best: keep the strip mounted via a wrapper `<Animated.View>` with `exiting={FadeOutDown.duration(150)}`, where the wrapper handles its own unmount via Reanimated's exit driver.

**Files to modify:** `src/components/input/InputBarAnnotationStrip.tsx` (likely), `src/components/input/InputBar.tsx` (parent mount logic), possibly `app/index.tsx` (timing of state resets)

**Verification:**
- Add 2+ annotations → tap X → confirm → strip fades down + out over 150ms before keyboard dismisses.
- Tap "Done annotating" with no annotations cleared → strip persists (annotations still present). Correct.
- Send main message with annotations → strip fades out as `clearAnnotations` fires in `handleSend` mode 2.

---

### Bug #7 — Done-flow Δ-478 instant-snap on focus mode exit

**Status:** PARTIALLY MITIGATED. Chrome collapse deferred until `keyboardDidHide` — clamp no longer happens mid-kb-hide. Residual: a smaller instant clamp may still be visible AFTER the kb is fully hidden, when the chrome unmounts and FlashList layoutH grows ~227px in one tick. `useLayoutEffect` in MessageList fires an animated `scrollToOffset(currentOffset + 2000)` on the latched flip to polish residual motion, but iOS still wins the instant-clamp race vs. our scrollToOffset (verified via logs: iOS clamp lands 1ms after layout commit, before our scroll request reaches native).

**Symptom (pre-fix):** User taps Done while deep in an annotation row (offset 2082, layoutH 301 in focus mode) → kb starts hiding → focus-mode chrome collapses in the same tick → FlashList layoutH grows 301→528 → iOS UIScrollView instant-clamps `contentOffset` to `contentH + contentInset.bottom - layoutH` → visible Δ-478 jump mid-kb-hide. Then kb finishes hiding while the list is already settled at the clamped offset. User perceives "noticeable layout shift after the keyboard disappears" (actually during, but the perception bleeds).

**Root cause:** `exitAnnotationFocusMode` in `app/index.tsx` synchronously cleared `targetAnnotationId` + `annotateMessageId` and blurred the input. The blur drove `annotationComposerFocused` false via the InputBar effect. Both state flips collapsed the focus-mode chrome (`CollapsingChatHeader` + InputBarCard `CollapseWhen instantCollapse`) in the same React commit. `CollapseWhen` uses `display: 'none'` for hidden state, so the layout transition is instantaneous — no height animation that iOS could smoothly track. iOS UIScrollView responds to the layout commit with an instant `contentOffset` clamp; JS-side scroll requests can't beat the native layout-clamp path (verified: useLayoutEffect-based animated scroll loses the race by ~1ms).

**Fix attempts and outcomes:**
- ❌ Bigger `FOCUS_MODE_CONTENT_INSET` (500) — caused Δ+396 jump on focus enter via iOS's contentOffset auto-adjust on large inset.bottom change. Reverted to 120.
- ❌ Retention until kb-end via timer + scheduled inset release — broke Add Comment (MVCP race during enter).
- ❌ `useLayoutEffect` + animated `scrollToOffset(o + 2000)` — iOS still wins the race, instant-clamps before native receives our scroll. Useful only as residual polish.
- ✅ **Deferred chrome collapse** via `annotationFocusActiveLatched` mirror in `app/index.tsx`. True→false transition held until `KeyboardEvents.addListener('keyboardDidHide', ...)`. State clears (`setTargetAnnotationId(null)`, `setAnnotateMessageId(null)`) gated on `exitIntentRef.current` and run in the same finish callback. Provider's `composerFocused` overridden to `(raw || latched)` so `useIsAnnotationFocusActive()` returns true through the defer window. MessageList prop `annotationFocusActive={annotationFocusActiveLatched}` keeps MVCP gate + contentInset consistent. 500ms safety timer covers the case where kb wasn't actually visible.

**Re-entry race handled:** if user re-engages focus mode mid-defer (raw goes true again before keyboardDidHide), the effect's raw=true branch clears `exitIntentRef` and the useEffect cleanup cancels the pending listener+timer. The pending finish doesn't fire, state isn't clobbered.

**Files modified:** `app/index.tsx` (latched mirror, deferred exitAnnotationFocusMode, provider override, MessageList prop), `src/components/chat/MessageList.tsx` (`useLayoutEffect` post-exit animated scroll, `FOCUS_MODE_CONTENT_INSET` reverted to 120, MVCP `annotationFocusActive` branch).

**Verification:**
- Tap Done deep in annotation row → kb hides cleanly with no mid-hide snap. After kb fully hidden, chrome unmounts, chat settles. The post-kb-end clamp may still be visible as a smaller instant motion; verify it's bounded by the animated `scrollToOffset` polish.
- Re-entry race: tap Done, immediately tap another annotation row before kb hides → focus mode persists on new target, no spurious state clear.
- Done with kb already hidden (e.g. swiped down) → state clears via 500ms safety timer.
- Add Comment flow unaffected (Path B still fires cleanly on enter).

**Future work (if residual clamp still visible enough to ship-block):**
- Replace `CollapseWhen` `display: 'none'` with a height-animated wrapper for the focus-mode chrome. Would let iOS smoothly track the layoutH grow instead of instant-clamping. Trade-off: re-introduces the Yoga measurement bug `CollapseWhen` was rewritten to avoid (see `CollapseWhen.tsx:23-34` comment).
- Or: hold `FOCUS_MODE_CONTENT_INSET` for a few frames AFTER the latched flip so iOS clamp lands at an offset within the extended range. Trade-off: per-frame inset choreography is fragile.

---

## 13. Other Programmatic Scrolls Worth Noting

Discovered during audit; not user-facing bugs today but worth knowing about:

- **scrollToMessageId imperative handle** (`MessageList.tsx:1007-1011`) — exposed for deep-link / programmatic navigation. Confirm a caller still uses it before assuming it's load-bearing.
- **Pill cycle scroll** (`scrollToAnnotationId` at `MessageList.tsx:1012-1051`) — when user taps a chevron in the annotation strip, list scrolls to the next annotation with a 700ms highlight flash. Unaffected by Bug #4 fix (chevrons just hidden at count ≤ 1).
- **History prepend MVCP** (`MessageList.tsx:869-871`) — when loading older messages, viewport stays anchored via `maintainVisibleContentPosition`. No tweaks needed.
- **Status message arrival scroll** (`MessageList.tsx:817-837`) — when a status/system message arrives, pin-to-bottom latch armed with `force:false`. Only scrolls if user already near bottom.
- **Reset session snap** (`MessageList.tsx:674-691`) — `isResetting` triggers instant `scrollToEnd`. Used when user resets/clears a session.

---

## 14. Diagnostic Logs (kb / scroll / layout)

Currently in tree but slated for removal once the Add-Comment / Done flow has been verified stable. Documented here so future debugging can re-add them quickly. All gated by `EXPO_PUBLIC_DEBUG_KEYBOARD=1`.

Run with: `EXPO_PUBLIC_DEBUG_KEYBOARD=1 npx expo start --clear`.

| Label format | Site (func, file:line approx) | Trigger | Fields surfaced |
|---|---|---|---|
| `[Scroll] offsetY a→b (Δd) lh=X ch=Y ts=T` | `onScroll`, `MessageList.tsx:956` | `onScroll` callback, only when `abs(Δy) > 1` | offsetY, layoutH, contentH, ts |
| `[Layout] layoutH a→b (Δd) ts=T` | `onLayout`, `MessageList.tsx:1097` | `onLayout` callback, only when `h` changed | layoutH, ts |
| `[KB] h=H layoutH=L baseLh=B finalH=F contentH=C spacer=S composerFlag=cf pendingReveal=p ts=T` | `onKeyboardFrame`, `MessageList.tsx:1405` | every `useKeyboardHandler` tick (onStart/onMove/onEnd via runOnJS) | full kb+layout snapshot |
| `[KB] postDoneSettle target=T cur=C max=M cardBottom=CB lh=L ch=Ch` | `postDoneSettleScroll`, `MessageList.tsx:1271` | kb-hide `onEnd` with refs populated (Done flow) | target math inputs |
| `[KB] >>scroll PathA offset=O effLh=E ts=T` | `scrollTailFromBaseline`, `MessageList.tsx:1333` | Path A tail-anchor fires | tail-anchor offset |
| `[KB] >>scroll PathB fallback (no cache or baseLh=0) ts=T` | `scrollRevealPerFrame`, `MessageList.tsx:1360` | JS-fallback bailed (cache/baseLh missing) | none |
| `[KB] >>scroll PathB offset=O effLh=E kbH=H currentLh=L baseLh=B ts=T` | `scrollRevealPerFrame`, `MessageList.tsx:1385` | JS fallback Path B fires | offset + math |
| `[KB] >>worklet PathB target=T kb=K effLh=E` | `useAnimatedReaction` body, `MessageList.tsx:1475` | UI-thread Path B reaction fires `scrollTo` | worklet target + math |
| `[KB] corrective Path B fallback ts=T` | `correctiveEndScroll`, `MessageList.tsx:1500` | onEnd corrective fires legacy `revealSectionRef` (worklet never scrolled — kb-already-up race) | none |
| `[KB] corrective skipped (Path B already scrolled) ts=T` | `correctiveEndScroll`, `MessageList.tsx:1505` | onEnd corrective skipped (worklet landed) | none |
| `[KB] corrective Path A scrollToMessagesEnd ts=T` | `correctiveEndScroll`, `MessageList.tsx:1512` | onEnd corrective Path A re-anchor | none |
| `[KB] armPendingReveal id=X baseLh=L kbUp=B ts=T` | `armPendingReveal`, `MessageList.tsx:1694` | entry into `armPendingReveal` | arm state |
| `[KB] cached measure y=Y h=H ts=T` | measureLayout cb in `armPendingReveal`, `MessageList.tsx:1728` | cache populated | y, h |
| `[KB] armPendingReveal RAF (kb already up) ts=T` | `armPendingReveal`, `MessageList.tsx:1737` | kb-already-up immediate-fire branch | none |

Sibling flags worth knowing:

- `EXPO_PUBLIC_DEBUG_LIST_PERF=1` → `[ListPerf]` (`onContentSizeChange`, `MessageList.tsx:1065`): contentH delta + reason (stream / history / etc).
- `EXPO_PUBLIC_DEBUG_ITEM_HEIGHTS=1` → `[ItemHeight]` per-item measured height dump.

Reading the logs:

- All `ts` values are `Date.now() % 100000` (5-digit modulo ms). Use to align `[KB]`, `[Scroll]`, `[Layout]` events on the same timeline.
- Path B happy path expects: `armPendingReveal` → `cached measure` → many `>>worklet PathB target=…` lines tracking kb rise → `corrective skipped`.
- Done flow happy path expects: kb=0 onStart frame → iOS auto-clamp `[Scroll]` Δ-… → kb=0 onEnd frame → `postDoneSettle` → final `[Scroll]` (snap to settled max).

When re-adding: grep for the function names above (`onScroll`, `onLayout`, `onKeyboardFrame`, `postDoneSettleScroll`, `scrollTailFromBaseline`, `scrollRevealPerFrame`, the worklet reaction, `correctiveEndScroll`, `armPendingReveal`) — line numbers will drift.
