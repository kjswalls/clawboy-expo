import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { InlineAnnotationRow } from '../InlineAnnotationRow';
import { AnnotationDraftProvider } from '@/contexts/AnnotationDraftContext';
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

const blockAnnotationWithComment: Annotation = {
  ...blockAnnotation,
  id: 'ann-block-2',
  comment: 'Great insight here.',
};

const noop = (): void => {};

describe('InlineAnnotationRow', () => {
  it('renders placeholder when comment is empty', () => {
    const { getByText } = renderWithProviders(
      <InlineAnnotationRow
        annotation={blockAnnotation}
        onEditPress={noop}
        onLongPress={noop}
        colors={colors}
      />,
    );
    expect(getByText('Add a comment…')).toBeTruthy();
  });

  it('renders comment text when present', () => {
    const { getByText } = renderWithProviders(
      <InlineAnnotationRow
        annotation={blockAnnotationWithComment}
        onEditPress={noop}
        onLongPress={noop}
        colors={colors}
      />,
    );
    expect(getByText(blockAnnotationWithComment.comment)).toBeTruthy();
  });

  it('calls onEditPress with annotation id on tap', () => {
    const onEditPress = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <InlineAnnotationRow
        annotation={blockAnnotation}
        onEditPress={onEditPress}
        onLongPress={noop}
        colors={colors}
      />,
    );
    fireEvent.press(getByLabelText('Add a comment…'));
    expect(onEditPress).toHaveBeenCalledWith(blockAnnotation.id);
  });

  it('calls onLongPress with annotation id on long-press', () => {
    const onLongPress = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <InlineAnnotationRow
        annotation={blockAnnotation}
        onEditPress={noop}
        onLongPress={onLongPress}
        colors={colors}
      />,
    );
    fireEvent(getByLabelText('Add a comment…'), 'longPress');
    expect(onLongPress).toHaveBeenCalledWith(blockAnnotation.id);
  });

  describe('live draft via AnnotationDraftProvider', () => {
    it('shows live draft text when targetId matches annotation id', () => {
      const liveDraft = 'typing live now';
      const { getByText, queryByText } = renderWithProviders(
        <AnnotationDraftProvider targetId={blockAnnotation.id} draftText={liveDraft}>
          <InlineAnnotationRow
            annotation={blockAnnotation}
            onEditPress={noop}
            onLongPress={noop}
            colors={colors}
          />
        </AnnotationDraftProvider>,
      );
      expect(getByText(liveDraft)).toBeTruthy();
      expect(queryByText('Add a comment…')).toBeNull();
    });

    it('shows editing placeholder when targetId matches but draft is empty', () => {
      const { getByText } = renderWithProviders(
        <AnnotationDraftProvider targetId={blockAnnotation.id} draftText="">
          <InlineAnnotationRow
            annotation={blockAnnotation}
            onEditPress={noop}
            onLongPress={noop}
            colors={colors}
          />
        </AnnotationDraftProvider>,
      );
      expect(getByText('Write your comment…')).toBeTruthy();
    });

    it('shows saved comment when targetId does not match', () => {
      const { getByText, queryByText } = renderWithProviders(
        <AnnotationDraftProvider targetId="different-id" draftText="ignored live text">
          <InlineAnnotationRow
            annotation={blockAnnotationWithComment}
            onEditPress={noop}
            onLongPress={noop}
            colors={colors}
          />
        </AnnotationDraftProvider>,
      );
      expect(getByText(blockAnnotationWithComment.comment)).toBeTruthy();
      expect(queryByText('ignored live text')).toBeNull();
    });

    it('shows saved comment when targetId is null', () => {
      const { getByText } = renderWithProviders(
        <AnnotationDraftProvider targetId={null} draftText="ignored">
          <InlineAnnotationRow
            annotation={blockAnnotationWithComment}
            onEditPress={noop}
            onLongPress={noop}
            colors={colors}
          />
        </AnnotationDraftProvider>,
      );
      expect(getByText(blockAnnotationWithComment.comment)).toBeTruthy();
    });
  });

  describe('active vs inactive styling', () => {
    it('applies primary border when row is the live draft target', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <AnnotationDraftProvider targetId={blockAnnotation.id} draftText="">
          <InlineAnnotationRow
            annotation={blockAnnotation}
            onEditPress={noop}
            onLongPress={noop}
            colors={colors}
          />
        </AnnotationDraftProvider>,
      );
      const { View } = require('react-native');
      const card = UNSAFE_getByType(View);
      const flatStyle = StyleSheet.flatten(card.props.style);
      expect(flatStyle.borderColor).toBe(colors.primary);
    });

    it('applies muted border when row is not the live draft target', () => {
      const { UNSAFE_getByType } = renderWithProviders(
        <AnnotationDraftProvider targetId="other-id" draftText="ignored">
          <InlineAnnotationRow
            annotation={blockAnnotation}
            onEditPress={noop}
            onLongPress={noop}
            colors={colors}
          />
        </AnnotationDraftProvider>,
      );
      const { View } = require('react-native');
      const card = UNSAFE_getByType(View);
      const flatStyle = StyleSheet.flatten(card.props.style);
      expect(flatStyle.borderColor).toBe(`${colors.primary}40`);
    });
  });

  it('renders snapshot', () => {
    const { toJSON } = renderWithProviders(
      <InlineAnnotationRow
        annotation={blockAnnotation}
        onEditPress={noop}
        onLongPress={noop}
        colors={colors}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
