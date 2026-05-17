/**
 * Two-signal pill state derived from scroll + latch refs.
 *
 *  - `showPill` is the nav affordance: visible when the user is scrolled away
 *    from the bottom (no streaming required).
 *  - `hasNewMessages` drives the pulsing dot + "New messages" label; only
 *    true when the user is away AND the latch flag has been set.
 *
 * Pure so we can unit-test the derivation independently of `MessageList`'s
 * imperative ref+state plumbing.
 */
export interface PillStateInput {
  /** True when the user is within the near-bottom threshold of the list. */
  nearBottom: boolean;
  /** Latched flag: assistant content arrived while the user was scrolled away. */
  unseenContent: boolean;
  /** True when the last visible message in the ordered list is an assistant message. */
  lastIsAssistant: boolean;
}

export interface PillState {
  showPill: boolean;
  hasNewMessages: boolean;
}

export function derivePillState({ nearBottom, unseenContent, lastIsAssistant }: PillStateInput): PillState {
  const showPill = !nearBottom && lastIsAssistant;
  const hasNewMessages = !nearBottom && unseenContent && lastIsAssistant;
  return { showPill, hasNewMessages };
}
