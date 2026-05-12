import { describe, it, expect } from '@jest/globals';
import { resolveTier, isFoundersWindowOpen, foundersWindowRemainingMs } from '../products';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

describe('resolveTier', () => {
  it('returns free for empty array', () => {
    expect(resolveTier([])).toBe('free');
  });

  it('returns pro for [pro]', () => {
    expect(resolveTier(['pro'])).toBe('pro');
  });

  it('returns founder for [founder]', () => {
    expect(resolveTier(['founder'])).toBe('founder');
  });

  it('returns founder when both pro and founder are present', () => {
    expect(resolveTier(['pro', 'founder'])).toBe('founder');
  });

  it('returns free for unknown entitlement', () => {
    expect(resolveTier(['unknown'])).toBe('free');
  });
});

describe('isFoundersWindowOpen', () => {
  it('returns false when launchAt is null', () => {
    expect(isFoundersWindowOpen(null)).toBe(false);
  });

  it('returns false when now is before launchAt', () => {
    const launchAt = new Date(Date.now() + 10_000); // 10s in the future
    const now = new Date();
    expect(isFoundersWindowOpen(launchAt, now)).toBe(false);
  });

  it('returns true when within the 60-day window', () => {
    const launchAt = new Date(Date.now() - 1000); // 1 second ago
    const now = new Date();
    expect(isFoundersWindowOpen(launchAt, now)).toBe(true);
  });

  it('returns false when past the 60-day window', () => {
    const launchAt = new Date(Date.now() - SIXTY_DAYS_MS - 1000); // just past 60 days
    const now = new Date();
    expect(isFoundersWindowOpen(launchAt, now)).toBe(false);
  });
});

describe('foundersWindowRemainingMs', () => {
  it('returns 0 when launchAt is null', () => {
    expect(foundersWindowRemainingMs(null)).toBe(0);
  });

  it('returns 0 when window has already closed', () => {
    const launchAt = new Date(Date.now() - SIXTY_DAYS_MS - 1000);
    const now = new Date();
    expect(foundersWindowRemainingMs(launchAt, now)).toBe(0);
  });

  it('returns a positive number close to expected ms when within window', () => {
    const now = new Date();
    const launchAt = new Date(now.getTime() - 1000); // opened 1 second ago
    const remaining = foundersWindowRemainingMs(launchAt, now);
    const expected = SIXTY_DAYS_MS - 1000;
    // Allow 10ms tolerance for floating point
    expect(remaining).toBeGreaterThan(expected - 10);
    expect(remaining).toBeLessThanOrEqual(expected);
  });
});
