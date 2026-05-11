import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders with 0% fill when value is 0', () => {
    const { toJSON } = renderWithProviders(<ProgressBar value={0} max={100} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with 50% fill', () => {
    const { toJSON } = renderWithProviders(<ProgressBar value={50} max={100} />);
    // Snapshot captures the width style
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with 100% fill at exact max', () => {
    const { toJSON } = renderWithProviders(<ProgressBar value={100} max={100} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('clamps above 100% when value exceeds max', () => {
    const { toJSON } = renderWithProviders(<ProgressBar value={200} max={100} />);
    // Should not go above 100%
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with 0% fill when max is 0 (avoids divide-by-zero)', () => {
    const { toJSON } = renderWithProviders(<ProgressBar value={5} max={0} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with a custom color', () => {
    const { toJSON } = renderWithProviders(<ProgressBar value={30} max={100} color="#FF0000" />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with a custom height', () => {
    const { toJSON } = renderWithProviders(<ProgressBar value={50} max={100} height={8} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
