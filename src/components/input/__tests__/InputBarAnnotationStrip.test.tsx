import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { InputBarAnnotationStrip } from '../InputBarAnnotationStrip';

const noop = (): void => {};

const PREV_LABEL_1 = 'Go to previous comment (1 total)';
const PREV_LABEL_2 = 'Go to previous comment (2 total)';
const PREV_LABEL_3 = 'Go to previous comment (3 total)';
const NEXT_LABEL_1 = 'Go to next comment (1 total)';
const NEXT_LABEL_2 = 'Go to next comment (2 total)';
const NEXT_LABEL_3 = 'Go to next comment (3 total)';
const PREVIEW_LABEL = 'Preview composed reply';
const CLEAR_LABEL = 'Clear all comments';

describe('InputBarAnnotationStrip', () => {
  it('renders nothing when count is 0', () => {
    const { toJSON } = renderWithProviders(
      <InputBarAnnotationStrip
        annotationCount={0}
        onCyclePrev={noop}
        onCycleNext={noop}
        onPreview={noop}
        onClear={noop}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders count row with chevrons when count > 0', () => {
    const { getByLabelText } = renderWithProviders(
      <InputBarAnnotationStrip
        annotationCount={2}
        onCyclePrev={noop}
        onCycleNext={noop}
        onPreview={noop}
        onClear={noop}
      />,
    );
    expect(getByLabelText(PREV_LABEL_2)).toBeTruthy();
    expect(getByLabelText(NEXT_LABEL_2)).toBeTruthy();
    expect(getByLabelText(PREVIEW_LABEL)).toBeTruthy();
    expect(getByLabelText(CLEAR_LABEL)).toBeTruthy();
  });

  it('fires onCyclePrev from left chevron', () => {
    const onCyclePrev = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <InputBarAnnotationStrip
        annotationCount={2}
        onCyclePrev={onCyclePrev}
        onCycleNext={noop}
        onPreview={noop}
        onClear={noop}
      />,
    );
    fireEvent.press(getByLabelText(PREV_LABEL_2));
    expect(onCyclePrev).toHaveBeenCalledTimes(1);
  });

  it('fires onCycleNext from right chevron', () => {
    const onCycleNext = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <InputBarAnnotationStrip
        annotationCount={2}
        onCyclePrev={noop}
        onCycleNext={onCycleNext}
        onPreview={noop}
        onClear={noop}
      />,
    );
    fireEvent.press(getByLabelText(NEXT_LABEL_2));
    expect(onCycleNext).toHaveBeenCalledTimes(1);
  });

  it('fires onPreview and onClear', () => {
    const onPreview = jest.fn();
    const onClear = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <InputBarAnnotationStrip
        annotationCount={1}
        onCyclePrev={noop}
        onCycleNext={noop}
        onPreview={onPreview}
        onClear={onClear}
      />,
    );
    fireEvent.press(getByLabelText(PREVIEW_LABEL));
    expect(onPreview).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText(CLEAR_LABEL));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('chevrons are disabled when count is 1', () => {
    const onCyclePrev = jest.fn();
    const onCycleNext = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <InputBarAnnotationStrip
        annotationCount={1}
        onCyclePrev={onCyclePrev}
        onCycleNext={onCycleNext}
        onPreview={noop}
        onClear={noop}
      />,
    );
    // Pressable with disabled=true should not fire onPress
    fireEvent.press(getByLabelText(PREV_LABEL_1));
    fireEvent.press(getByLabelText(NEXT_LABEL_1));
    expect(onCyclePrev).not.toHaveBeenCalled();
    expect(onCycleNext).not.toHaveBeenCalled();
  });

  it('chevrons are enabled when count > 1', () => {
    const onCyclePrev = jest.fn();
    const onCycleNext = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <InputBarAnnotationStrip
        annotationCount={3}
        onCyclePrev={onCyclePrev}
        onCycleNext={onCycleNext}
        onPreview={noop}
        onClear={noop}
      />,
    );
    fireEvent.press(getByLabelText(PREV_LABEL_3));
    expect(onCyclePrev).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText(NEXT_LABEL_3));
    expect(onCycleNext).toHaveBeenCalledTimes(1);
  });

  it('renders snapshot', () => {
    const { toJSON } = renderWithProviders(
      <InputBarAnnotationStrip
        annotationCount={2}
        onCyclePrev={noop}
        onCycleNext={noop}
        onPreview={noop}
        onClear={noop}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
