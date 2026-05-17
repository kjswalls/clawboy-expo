import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';

const mockReducedMotion = jest.fn(() => false);

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    Image: RN.Image,
    ScrollView: RN.ScrollView,
    FlatList: RN.View,
    createAnimatedComponent: (C: React.ComponentType) => C,
  };
  return {
    default: Animated,
    ...Animated,
    useSharedValue: (init: unknown) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withDelay: (_d: number, a: unknown) => a,
    withSequence: (...a: unknown[]) => a[a.length - 1],
    withRepeat: (a: unknown) => a,
    cancelAnimation: () => {},
    Easing: { linear: (t: number) => t },
    useReducedMotion: () => mockReducedMotion(),
  };
});

import { SweepingText } from '../SweepingText';

describe('SweepingText', () => {
  beforeEach(() => {
    mockReducedMotion.mockReturnValue(false);
  });

  it('renders animated sweep (default)', () => {
    const { toJSON } = renderWithProviders(
      <SweepingText text="Agent is working…" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders static highlight when reduced motion is active', () => {
    mockReducedMotion.mockReturnValue(true);
    const { toJSON } = renderWithProviders(
      <SweepingText text="Resetting session…" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('accepts custom cycleMs and baseColor', () => {
    const { toJSON } = renderWithProviders(
      <SweepingText
        text="Compacting context…"
        cycleMs={2000}
        baseColor="#888888"
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
