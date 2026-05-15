/**
 * InlineAnnotationRow tests — verifies the default-hide behavior for block
 * anchors and the always-visible behavior for range anchors.
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { InlineAnnotationRow } from '../InlineAnnotationRow';
import { Colors } from '@/constants/theme';
import type { Annotation } from '@/lib/annotations';

const colors = Colors.dark;

const blockAnnotation: Annotation = {
  id: 'ann-block-1',
  messageId: 'msg-1',
  anchor: { kind: 'block', blockIndex: 0 },
  quotedText: 'This is the full section text that would normally be duplicated on screen.',
  comment: '',
  createdAt: new Date('2024-01-01T00:00:00Z').getTime(),
};

const rangeAnnotation: Annotation = {
  id: 'ann-range-1',
  messageId: 'msg-1',
  anchor: { kind: 'range', start: 5, end: 42 },
  quotedText: 'a meaningful sub-selection of text',
  comment: '',
  createdAt: new Date('2024-01-01T00:00:00Z').getTime(),
};

const noop = (): void => {};

describe('InlineAnnotationRow', () => {
  describe('block anchor', () => {
    it('hides quote by default and shows "Show quote" toggle', () => {
      const { queryByText, getByText } = renderWithProviders(
        <InlineAnnotationRow
          annotation={blockAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          colors={colors}
        />,
      );

      // Quote text must NOT be visible by default
      expect(queryByText(blockAnnotation.quotedText)).toBeNull();
      // Show quote affordance must be present
      expect(getByText('Show quote')).toBeTruthy();
    });

    it('reveals quote after tapping "Show quote"', () => {
      const { getByText } = renderWithProviders(
        <InlineAnnotationRow
          annotation={blockAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          colors={colors}
        />,
      );

      fireEvent.press(getByText('Show quote'));

      // Quote text must now be visible
      expect(getByText(blockAnnotation.quotedText)).toBeTruthy();
      // Toggle changes to "Hide quote"
      expect(getByText('Hide quote')).toBeTruthy();
    });

    it('hides quote again after tapping "Hide quote"', () => {
      const { getByText, queryByText } = renderWithProviders(
        <InlineAnnotationRow
          annotation={blockAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          colors={colors}
        />,
      );

      fireEvent.press(getByText('Show quote'));
      fireEvent.press(getByText('Hide quote'));

      expect(queryByText(blockAnnotation.quotedText)).toBeNull();
      expect(getByText('Show quote')).toBeTruthy();
    });

    it('renders snapshot (collapsed state)', () => {
      const { toJSON } = renderWithProviders(
        <InlineAnnotationRow
          annotation={blockAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          colors={colors}
        />,
      );
      expect(toJSON()).toMatchSnapshot();
    });

    it('renders snapshot (expanded state)', () => {
      const { toJSON, getByText } = renderWithProviders(
        <InlineAnnotationRow
          annotation={blockAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          colors={colors}
        />,
      );
      fireEvent.press(getByText('Show quote'));
      expect(toJSON()).toMatchSnapshot();
    });
  });

  describe('range anchor', () => {
    it('shows quote by default', () => {
      const { getByText, queryByText } = renderWithProviders(
        <InlineAnnotationRow
          annotation={rangeAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          colors={colors}
        />,
      );

      expect(getByText(rangeAnnotation.quotedText)).toBeTruthy();
      expect(queryByText('Show quote')).toBeNull();
    });

    it('renders snapshot', () => {
      const { toJSON } = renderWithProviders(
        <InlineAnnotationRow
          annotation={rangeAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          colors={colors}
        />,
      );
      expect(toJSON()).toMatchSnapshot();
    });
  });

  describe('callbacks', () => {
    it('calls onCommentFocus with annotation id when input is focused', () => {
      const onFocus = jest.fn();
      const { getByPlaceholderText } = renderWithProviders(
        <InlineAnnotationRow
          annotation={blockAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          onCommentFocus={onFocus}
          colors={colors}
        />,
      );

      fireEvent(getByPlaceholderText('Add a comment (optional)\u2026'), 'focus');
      expect(onFocus).toHaveBeenCalledWith(blockAnnotation.id);
    });

    it('calls onCommentBlur when input blurs', () => {
      const onBlur = jest.fn();
      const { getByPlaceholderText } = renderWithProviders(
        <InlineAnnotationRow
          annotation={blockAnnotation}
          onUpdateComment={noop}
          onRemove={noop}
          onCommentBlur={onBlur}
          colors={colors}
        />,
      );

      const input = getByPlaceholderText('Add a comment (optional)\u2026');
      fireEvent(input, 'focus');
      fireEvent(input, 'blur');
      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('calls onRemove with annotation id when remove is pressed', () => {
      const onRemove = jest.fn();
      const { getByLabelText } = renderWithProviders(
        <InlineAnnotationRow
          annotation={blockAnnotation}
          onUpdateComment={noop}
          onRemove={onRemove}
          colors={colors}
        />,
      );

      fireEvent.press(getByLabelText('Remove'));
      expect(onRemove).toHaveBeenCalledWith(blockAnnotation.id);
    });
  });
});
