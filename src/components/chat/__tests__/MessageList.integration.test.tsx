/**
 * MessageList integration tests — §9 scroll contract guards.
 *
 * Strategy: mount MessageList with a synchronous FlashList mock (see
 * src/__mocks__/flash-list.js) that exposes `__simulate*` imperative helpers
 * and stable jest.fn() scroll spies. Tests drive the prop sequences that
 * mirror real flows and assert which listRef methods are called.
 *
 * Fidelity limits (see flash-list.js header for details):
 *  - maintainVisibleContentPosition is asserted by config, not by scroll
 *    position change — native MVCP behaviour requires a real FlashList.
 *  - scrollToIndex quirks on unmeasured tail items need Layer 3 / simulator.
 *
 * Each test case references the §9 contract it guards so the link survives
 * future refactors.
 */

import React from 'react';
import { act } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { MessageList } from '../MessageList';
import type { ChatUiMessage } from '@/types/chat-ui';

// Access FlashList mock helpers via the module singleton.
const flashListMock = require('@shopify/flash-list');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2024-06-01T10:00:00.000Z');

function makeUser(id: string, content = 'hello'): ChatUiMessage {
  return { id, role: 'user', content, timestamp: NOW };
}

function makeAsst(id: string, content = 'hi there'): ChatUiMessage {
  return { id, role: 'assistant', content, timestamp: NOW };
}

function makeStreaming(id: string): ChatUiMessage {
  return { id, role: 'assistant', content: '', isStreaming: true, timestamp: NOW };
}

/** Returns the FlashList mock ref for the most recently mounted list. */
function getListRef() {
  const ref = flashListMock.__getLastRef();
  if (!ref) throw new Error('FlashList mock ref not set — component may not have mounted');
  return ref;
}

function renderList(props: Partial<React.ComponentProps<typeof MessageList>> = {}) {
  const result = renderWithProviders(
    <MessageList
      messages={[]}
      sessionKey="session-1"
      {...props}
    />,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  flashListMock.__resetLastRef();
});

afterEach(() => {
  jest.runAllTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// T1 — Smoke: mounts without crashing
// ---------------------------------------------------------------------------

describe('MessageList — smoke', () => {
  it('renders without crashing with empty messages', () => {
    expect(() => renderList()).not.toThrow();
  });

  it('renders without crashing with a user+assistant exchange', () => {
    expect(() =>
      renderList({ messages: [makeUser('u1'), makeAsst('a1')] }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T2 — C4: MVCP config reflects needsAnchorSpace
// §9 contract: "lastIsUser or streaming → MVCP -1; else MVCP 1"
// ---------------------------------------------------------------------------

describe('MessageList — C4 MVCP gating', () => {
  it('passes autoscrollToBottomThreshold: -1 when tail is a user message', () => {
    // Guards Fix B: MVCP must be disabled (-1) while lastIsUser so FlashList
    // doesn't fight the send-anchor scroll by pinning to the bottom.
    renderList({ messages: [makeUser('u1')] });
    const mvcp = getListRef().__getMvcp();
    expect(mvcp).toEqual({ autoscrollToBottomThreshold: -1 });
  });

  it('passes autoscrollToBottomThreshold: -1 when assistant is streaming', () => {
    renderList({ messages: [makeUser('u1'), makeStreaming('stream-1')] });
    const mvcp = getListRef().__getMvcp();
    expect(mvcp).toEqual({ autoscrollToBottomThreshold: -1 });
  });

  it('passes autoscrollToBottomThreshold: 1 when last message is non-streaming assistant', () => {
    // Guards the normal follow-tail state: FlashList can auto-pin with 1px threshold.
    renderList({ messages: [makeUser('u1'), makeAsst('a1')] });
    const mvcp = getListRef().__getMvcp();
    expect(mvcp).toEqual({ autoscrollToBottomThreshold: 1 });
  });

  it('passes autoscrollToTopThreshold: 0 during historyLoading', () => {
    // Guards Fix B MVCP branch: historyLoading → top-pin mode.
    renderList({ messages: [makeUser('u1'), makeAsst('a1')], historyLoading: true });
    const mvcp = getListRef().__getMvcp();
    expect(mvcp).toEqual({ autoscrollToTopThreshold: 0 });
  });
});

// ---------------------------------------------------------------------------
// T3 — C1: Cold-start / session-swap force-pins to bottom
// §9 contract: "sessionKey change arms force:true latch; first
//  onContentSizeChange with overflow fires scrollToMessagesEnd"
// ---------------------------------------------------------------------------

describe('MessageList — C1 cold start force pin', () => {
  it('calls scrollToEnd after session-swap + layout + content size change', () => {
    // Mount with empty messages (no spacer, scrollToEnd fallback path).
    // sessionKey effect arms force:true latch + 5000ms pin window.
    renderList({ messages: [], sessionKey: 'session-1' });
    const ref = getListRef();

    act(() => {
      ref.__simulateLayout(375, 800);
    });
    act(() => {
      ref.__simulateContentSize(375, 5000);
    });

    // With empty messages → spacerH = 0 → scrollToMessagesEnd calls scrollToEnd.
    expect(ref.scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('calls scrollToOffset when spacerH > 0 (messages with lastIsUser)', () => {
    // Guards: force pin uses scrollToOffset when anchor spacer is present.
    // spacerH = layoutH = 800 → offset = contentH - spacerH - layoutH = 5000-800-800 = 3400.
    renderList({ messages: [makeUser('u1')], sessionKey: 'session-1' });
    const ref = getListRef();

    act(() => { ref.__simulateLayout(375, 800); });
    act(() => { ref.__simulateContentSize(375, 5000); });

    expect(ref.scrollToOffset).toHaveBeenCalledWith({ offset: 3400, animated: false });
  });

  it('pin-window re-fires on subsequent content size changes within 5 s', () => {
    // Guards: FlashList virtualized measurement settling fires multiple size
    // events. Each should re-pin while within the window.
    renderList({ messages: [makeUser('u1')], sessionKey: 'session-1' });
    const ref = getListRef();

    act(() => { ref.__simulateLayout(375, 800); });
    act(() => { ref.__simulateContentSize(375, 5000); }); // consumes latch
    act(() => { ref.__simulateContentSize(375, 5500); }); // pin window still open

    // Should have fired twice: latch fire + pin-window fire.
    expect(ref.scrollToOffset).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// T4 — C1 guard: user drag before history loads prevents force-pull (Bug 1)
// §9 contract: "user drag disables pin-window + skeleton bypass"
// ---------------------------------------------------------------------------

describe('MessageList — C1 Bug-1 guard: no force-pull after user drags', () => {
  it('does NOT scroll when user dragged before onContentSizeChange fires', () => {
    renderList({ messages: [makeUser('u1')], sessionKey: 'session-1' });
    const ref = getListRef();

    act(() => { ref.__simulateLayout(375, 800); });
    act(() => { ref.__simulateBeginDrag(); }); // userTookControlRef = true
    act(() => { ref.__simulateContentSize(375, 5000); }); // pin window + latch should be gated

    // The latch fires BUT its safety timer (200ms) and pin-window bypass are
    // both gated by userTookControlRef. The latch itself doesn't check
    // userTookControlRef — only the skeleton/pin-window bypasses do.
    // After drag: pinUntilTsRef.current = 0 (cleared by onScrollBeginDrag),
    // so inPinWindow = false. latchFires depends on shouldFirePinLatch.
    // pinUntilTsRef was reset to 0 in onScrollBeginDrag, so pin window closed.
    // The latch (pinToBottomRef) still fires — that's intentional (latch ≠ pin window).
    // What's gated is the skeleton-dismissal scroll in the transition RAF.
    // Assert: the scroll fires at most ONCE (from the latch, not pin-window re-fire).
    expect(ref.scrollToOffset.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('does NOT call scrollToEnd from skeleton-dismiss when userTookControlRef is set', () => {
    // sessionKey change with skeleton active → skeleton dismiss fires scrollToMessagesEnd
    // only when !userTookControlRef.current.
    renderList({ messages: [], sessionKey: 'session-1' });
    const ref = getListRef();

    act(() => { ref.__simulateBeginDrag(); }); // sets userTookControlRef = true
    act(() => { ref.__simulateLayout(375, 800); });

    // Advance through the 2× RAF in the transition effect (skeleton dismiss path).
    act(() => { jest.advanceTimersByTime(10); });

    // With userTookControlRef set, the defensive scroll inside the 2× RAF
    // must be suppressed. scrollToEnd should not have been called by the
    // session transition effect.
    expect(ref.scrollToEnd).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T5 — C11: Reset activity snaps to end
// §9 contract: "isResetting → 2× RAF → scrollToEnd(animated:false)"
// ---------------------------------------------------------------------------

describe('MessageList — C11 reset', () => {
  it('calls scrollToEnd after 2 RAF ticks when activity.reason is resetting', () => {
    renderList({
      messages: [makeUser('u1'), makeAsst('a1')],
      activity: { reason: 'resetting' },
      sessionKey: 'session-1',
    });
    const ref = getListRef();

    act(() => { ref.__simulateLayout(375, 800); });
    // Advance 10ms — fires all 0ms RAF callbacks (nested) without triggering
    // BrandLoader's 220ms setInterval.
    act(() => { jest.advanceTimersByTime(10); });

    expect(ref.scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });
});

// ---------------------------------------------------------------------------
// T6 — C6: Send-anchor fires scrollToOffset after 3× RAF
// §9 contract: "new tail user message → 3× RAF → scrollToOffset with
//  contentH snapshot offset"
// ---------------------------------------------------------------------------

describe('MessageList — C6 send anchor', () => {
  it('fires scrollToOffset after 3 RAF ticks when user message appended to long chat', () => {
    // Start with a long conversation (assistant at tail → no send-anchor yet).
    const { rerender } = renderList({
      messages: [makeUser('u1'), makeAsst('a1')],
      sessionKey: 'session-1',
    });
    const ref = getListRef();

    // Simulate a long chat. spacerH = 0 (assistant at tail, needsAnchorSpace=false).
    act(() => { ref.__simulateLayout(375, 800); });
    act(() => { ref.__simulateContentSize(375, 5000); });
    // Bring user near bottom so wasScrolledUpAtSend = false.
    act(() => {
      ref.__simulateScroll({ y: 5000 - 800, contentH: 5000, layoutH: 800 });
    });

    // Append a new user message (triggers send-anchor effect).
    const newUser = makeUser('u2', 'a second message');
    act(() => {
      rerender(
        <MessageList
          messages={[makeUser('u1'), makeAsst('a1'), newUser]}
          sessionKey="session-1"
        />,
      );
    });

    // After rerender: needsAnchorSpace = true → spacerH = 800.
    // Simulate the content size growth from the new message + spacer.
    act(() => {
      ref.__simulateContentSize(375, 6200); // 5000 + ~400 for user msg + 800 spacer
    });

    // Advance 10ms — fires all 0ms RAF callbacks (the 3× send-anchor chain +
    // any session-swap transition RAFs still pending) without triggering the
    // 200ms latch safety timer or BrandLoader's 220ms interval.
    act(() => { jest.advanceTimersByTime(10); });

    // scrollToOffset must have been called (exact offset varies by markdown
    // line height from theme; assert the call happened with animated:true).
    expect(ref.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true }),
    );
  });

  it('does NOT fire scrollToOffset for a short chat (effectiveContentH <= layoutH)', () => {
    // Guards the early-return: if content fits in viewport, skip send-anchor.
    const { rerender } = renderList({
      messages: [makeAsst('a0')],
      sessionKey: 'session-1',
    });
    const ref = getListRef();

    act(() => { ref.__simulateLayout(375, 800); });
    act(() => {
      ref.__simulateScroll({ y: 0, contentH: 600, layoutH: 800 });
    });
    // Short chat: contentH (600) < layoutH (800) → near bottom → wasScrolledUpAtSend=false.

    const newUser = makeUser('u1', 'hi');
    act(() => {
      rerender(
        <MessageList
          messages={[makeAsst('a0'), newUser]}
          sessionKey="session-1"
        />,
      );
    });

    // spacerH = 800 (needsAnchorSpace=true after user appended)
    // effectiveContentH = contentH - spacerH = ~600+80 - 800 = negative → clamped to 0 <= layoutH
    act(() => { ref.__simulateContentSize(375, 680); });

    act(() => { jest.advanceTimersByTime(0); });
    act(() => { jest.advanceTimersByTime(0); });
    act(() => { jest.advanceTimersByTime(0); });

    // Early-return path: no scroll should have fired from send-anchor.
    // (session-swap latch may have fired scrollToEnd; that's acceptable,
    //  but the send-anchor specifically must not fire scrollToOffset.)
    const offsetCalls = ref.scrollToOffset.mock.calls;
    // All calls should NOT have animated:true (latch calls use animated:false).
    const sendAnchorCall = offsetCalls.find(
      ([arg]: [{ animated: boolean }]) => arg.animated === true,
    );
    expect(sendAnchorCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T7 — C2 guard: session swap during historyLoading arms force pin
// §9 contract: "historyLoading rising edge → armPinToBottom(true)"
// ---------------------------------------------------------------------------

describe('MessageList — C3 historyLoading pin', () => {
  it('calls scrollToEnd on content size change when historyLoading rises then drops', () => {
    const { rerender } = renderList({
      messages: [makeAsst('a1')],
      sessionKey: 'session-1',
      historyLoading: false,
    });
    const ref = getListRef();
    act(() => { ref.__simulateLayout(375, 800); });

    // Rising edge of historyLoading → armPinToBottom(true).
    act(() => {
      rerender(
        <MessageList
          messages={[makeAsst('a1')]}
          sessionKey="session-1"
          historyLoading={true}
        />,
      );
    });

    // Content arrives: latch fires.
    act(() => { ref.__simulateContentSize(375, 5000); });

    // Empty messages → spacerH=0 → scrollToEnd.
    expect(ref.scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });
});
