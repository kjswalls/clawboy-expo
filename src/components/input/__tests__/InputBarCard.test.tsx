import React from 'react';
import { act, render } from '@testing-library/react-native';
import { describe, it, expect, jest } from '@jest/globals';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { ExperimentsProvider } from '@/contexts/ExperimentsContext';

// expo-paste-input: make TextInputWrapper a transparent passthrough so the
// inner TextInput is always rendered and reachable via RNTL queries.
jest.mock('expo-paste-input', () => ({
  TextInputWrapper: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-device', () => ({ isDevice: true }));

// Pin Voice Control experiments off — these tests assert the default mirror-
// height path. Bisect builds flip the env vars at bundle time, not in jest.
jest.mock('@/constants/voiceControlInputExperiments', () => ({
  IOS_INPUT_SKIP_PASTE_WRAPPER: false,
  IOS_INPUT_USE_INTRINSIC_HEIGHT: false,
}));

import { InputBarCard } from '../InputBarCard';

const noop = () => {};

const baseProps = {
  defaultValue: '',
  text: '',
  onTextChange: noop,
  isFocused: false,
  onFocus: noop,
  onBlur: noop,
  inputRef: { current: null } as React.RefObject<null>,
  isThinking: false,
  disabled: false,
  attachments: [],
  onRemoveAttachment: noop,
  connectionStatus: 'connected' as const,
  onSend: noop,
  onPaperclip: noop,
  onSlash: noop,
  onCamera: noop,
};

function renderCard(overrides: Partial<typeof baseProps> = {}) {
  return render(
    <ThemeProvider>
      <ExperimentsProvider>
        <InputBarCard {...baseProps} {...overrides} />
      </ExperimentsProvider>
    </ThemeProvider>,
  );
}

function flatStyle(styleArr: object[]): Record<string, unknown> {
  return styleArr.reduce((acc, s) => ({ ...acc, ...s }), {} as Record<string, unknown>);
}

describe('InputBarCard — multiline auto-grow style', () => {
  it('renders TextInput with multiline + scrollEnabled and a dynamic height', () => {
    const { UNSAFE_getByType } = renderCard();
    const { TextInput } = require('react-native');
    const input = UNSAFE_getByType(TextInput);

    expect(input.props.multiline).toBe(true);
    expect(input.props.scrollEnabled).toBe(true);

    const flat = flatStyle(input.props.style as object[]);
    // height driven by mirror onLayout — starts at minInputHeight (> 0).
    expect(typeof flat.height).toBe('number');
    expect(flat.height as number).toBeGreaterThan(0);
    // maxHeight caps growth; must be larger than the initial one-line height.
    expect(flat.maxHeight as number).toBeGreaterThan(flat.height as number);
    // minHeight is absent — explicit height replaces it.
    expect(flat.minHeight).toBeUndefined();
  });

  it('grows height when the mirror Text reports a taller layout', () => {
    const { UNSAFE_getAllByType, UNSAFE_getByType, rerender } = renderCard();
    const { TextInput, Text } = require('react-native');

    const input = UNSAFE_getByType(TextInput);
    const initialHeight = (flatStyle(input.props.style as object[]).height) as number;

    // Find the hidden mirror — the Text with pointerEvents='none'.
    const allTexts = UNSAFE_getAllByType(Text) as Array<{ props: Record<string, unknown> }>;
    const mirror = allTexts.find((n) => n.props.pointerEvents === 'none');
    expect(mirror).toBeDefined();

    // Simulate the mirror being laid out with 3× the initial height.
    act(() => {
      const handler = mirror!.props.onLayout as (e: unknown) => void;
      handler({ nativeEvent: { layout: { width: 300, height: initialHeight * 3 } } });
    });

    // Re-render with multi-line text to keep the mirror content consistent.
    rerender(
      <ThemeProvider>
        <ExperimentsProvider>
          <InputBarCard {...baseProps} text={'line1\nline2\nline3'} />
        </ExperimentsProvider>
      </ThemeProvider>,
    );

    const grown = UNSAFE_getByType(TextInput);
    const grownHeight = (flatStyle(grown.props.style as object[]).height) as number;
    expect(grownHeight).toBeGreaterThan(initialHeight);
  });
});
