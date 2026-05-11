/**
 * Tests for AnnotationPreviewModal — annotations-005.
 *
 * Covers:
 *  - renders without crashing when visible
 *  - shows empty state when no annotations with quotedText
 *  - shows reference cards for annotations with quotedText
 *  - calls onClose when the close button is tapped
 *  - calls onSend when the send button is tapped
 */

import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { AnnotationPreviewModal } from '../AnnotationPreviewModal';
import type { Annotation } from '@/lib/annotations';

const baseAnnotation: Annotation = {
  id: 'ann-1',
  messageId: 'msg-1',
  anchor: { kind: 'block', blockIndex: 0 },
  quotedText: 'Some quoted text from the assistant message.',
  comment: 'My comment on this.',
  createdAt: new Date('2024-01-01T00:00:00Z').getTime(),
};

const emptyAnnotation: Annotation = {
  id: 'ann-empty',
  messageId: 'msg-1',
  anchor: { kind: 'block', blockIndex: 1 },
  quotedText: '',
  comment: '',
  createdAt: new Date('2024-01-01T00:00:00Z').getTime(),
};

const noop = () => {};
const messagesById = new Map<string, string>([
  ['msg-1', 'Some quoted text from the assistant message.'],
]);

describe('AnnotationPreviewModal', () => {
  it('renders without crashing when visible with annotations', () => {
    const { toJSON } = renderWithProviders(
      <AnnotationPreviewModal
        visible
        prelude=""
        annotations={[baseAnnotation]}
        messagesById={messagesById}
        onClose={noop}
        onSend={noop}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders without crashing when visible but empty (no annotations)', () => {
    const { toJSON } = renderWithProviders(
      <AnnotationPreviewModal
        visible
        prelude=""
        annotations={[]}
        messagesById={new Map()}
        onClose={noop}
        onSend={noop}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('is not rendered when visible=false', () => {
    const { toJSON } = renderWithProviders(
      <AnnotationPreviewModal
        visible={false}
        prelude=""
        annotations={[baseAnnotation]}
        messagesById={messagesById}
        onClose={noop}
        onSend={noop}
      />,
    );
    // Modal is not visible, tree should be minimal
    expect(toJSON()).toMatchSnapshot();
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <AnnotationPreviewModal
        visible
        prelude=""
        annotations={[baseAnnotation]}
        messagesById={messagesById}
        onClose={onClose}
        onSend={noop}
      />,
    );

    // 'Close' is the exact translation value; regex /close/i would also match
    // the lucide icon's accessibilityLabel "icon-X", so use exact string.
    const closeBtn = getByLabelText('Close');
    fireEvent.press(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSend when the send button is pressed', () => {
    const onSend = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <AnnotationPreviewModal
        visible
        prelude="My prelude text"
        annotations={[baseAnnotation]}
        messagesById={messagesById}
        onClose={noop}
        onSend={onSend}
      />,
    );

    // 'Send' exact string avoids matching the lucide icon's "icon-Send" label.
    const sendBtn = getByLabelText('Send');
    fireEvent.press(sendBtn);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('filters out annotations with empty quotedText from reference cards', () => {
    const { toJSON } = renderWithProviders(
      <AnnotationPreviewModal
        visible
        prelude=""
        annotations={[emptyAnnotation]}
        messagesById={new Map()}
        onClose={noop}
        onSend={noop}
      />,
    );
    // Should show empty state since the only annotation has no quotedText
    expect(toJSON()).toMatchSnapshot();
  });
});
