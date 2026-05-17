import { describe, it, expect } from '@jest/globals';

import { shouldFirePinLatch } from '../pinToBottom';

describe('shouldFirePinLatch', () => {
  it('does not fire when latch is null', () => {
    expect(shouldFirePinLatch(null, true)).toBe(false);
    expect(shouldFirePinLatch(null, false)).toBe(false);
  });

  it('always fires when force is true regardless of scroll position', () => {
    expect(shouldFirePinLatch({ force: true }, true)).toBe(true);
    expect(shouldFirePinLatch({ force: true }, false)).toBe(true);
  });

  it('fires when force is false only if user was already near bottom', () => {
    expect(shouldFirePinLatch({ force: false }, true)).toBe(true);
  });

  it('does not fire when force is false and user is scrolled up', () => {
    expect(shouldFirePinLatch({ force: false }, false)).toBe(false);
  });
});
