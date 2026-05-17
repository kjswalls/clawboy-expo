import { describe, it, expect } from '@jest/globals';

import { derivePillState } from '../pillState';

describe('derivePillState', () => {
  it('hides pill when user is near the bottom', () => {
    expect(derivePillState({ nearBottom: true, unseenContent: false, lastIsAssistant: true })).toEqual({
      showPill: false,
      hasNewMessages: false,
    });
  });

  it('hides pill near bottom even if unseen content is latched', () => {
    // Defensive: the latch should be cleared by the scroller, but assert
    // the derivation does not surface a stale latch as a visible pill.
    expect(derivePillState({ nearBottom: true, unseenContent: true, lastIsAssistant: true })).toEqual({
      showPill: false,
      hasNewMessages: false,
    });
  });

  it('shows nav-only pill when scrolled away with no unseen content', () => {
    expect(derivePillState({ nearBottom: false, unseenContent: false, lastIsAssistant: true })).toEqual({
      showPill: true,
      hasNewMessages: false,
    });
  });

  it('shows pill with new-messages badge when scrolled away and content latched', () => {
    expect(derivePillState({ nearBottom: false, unseenContent: true, lastIsAssistant: true })).toEqual({
      showPill: true,
      hasNewMessages: true,
    });
  });

  it('hides pill when scrolled away but last message is not assistant', () => {
    expect(derivePillState({ nearBottom: false, unseenContent: false, lastIsAssistant: false })).toEqual({
      showPill: false,
      hasNewMessages: false,
    });
  });

  it('hides new-messages badge when last message is not assistant even with unseen content latched', () => {
    expect(derivePillState({ nearBottom: false, unseenContent: true, lastIsAssistant: false })).toEqual({
      showPill: false,
      hasNewMessages: false,
    });
  });

  it('hides pill when near bottom and last is not assistant', () => {
    expect(derivePillState({ nearBottom: true, unseenContent: true, lastIsAssistant: false })).toEqual({
      showPill: false,
      hasNewMessages: false,
    });
  });
});
