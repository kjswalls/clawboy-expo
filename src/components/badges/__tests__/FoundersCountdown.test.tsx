import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { FoundersCountdown } from '../FoundersCountdown';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('FoundersCountdown', () => {
  it('renders null when remainingMs is 0', () => {
    const { toJSON } = renderWithProviders(<FoundersCountdown remainingMs={0} />);
    expect(toJSON()).toBeNull();
  });

  it('renders null when remainingMs is negative', () => {
    const { toJSON } = renderWithProviders(<FoundersCountdown remainingMs={-1} />);
    expect(toJSON()).toBeNull();
  });

  it('renders pill for 1 day remaining', () => {
    const { toJSON } = renderWithProviders(<FoundersCountdown remainingMs={DAY_MS} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders pill for 7 days remaining', () => {
    const { toJSON } = renderWithProviders(<FoundersCountdown remainingMs={7 * DAY_MS} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('rounds up partial day to 1 when only a few ms remain', () => {
    // 1ms remaining → Math.ceil → 1 day
    const { toJSON } = renderWithProviders(<FoundersCountdown remainingMs={1} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('rounds up 25 hours to 2 days (cross-day boundary)', () => {
    // Math.ceil(25 / 24) = 2
    const { toJSON } = renderWithProviders(<FoundersCountdown remainingMs={25 * 60 * 60 * 1000} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders correct day count for exactly 30 days', () => {
    const { toJSON } = renderWithProviders(<FoundersCountdown remainingMs={30 * DAY_MS} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
