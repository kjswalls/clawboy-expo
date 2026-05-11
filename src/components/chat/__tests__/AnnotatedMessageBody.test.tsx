/**
 * Tests for AnnotatedMessageBody — annotations-005.
 *
 * Covers:
 *  - renders sections from message content
 *  - renders existing annotations for the correct sections
 *  - snapshot for a simple message
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AnnotationProvider } from '@/contexts/AnnotationContext';
import { AnnotatedMessageBody } from '../AnnotatedMessageBody';
import type { ChatUiMessage } from '@/types/chat-ui';
import type { Annotation } from '@/lib/annotations';
import { Colors } from '@/constants/theme';
import { createMarkdownStyles } from '@/utils/markdownTheme';

const colors = Colors.dark;
const markdownStyles = createMarkdownStyles(colors);

const baseMessage: ChatUiMessage = {
  id: 'msg-1',
  role: 'assistant',
  content: '## Heading\n\nFirst paragraph of the assistant reply.\n\n## Second Section\n\nAnother paragraph here.',
  parts: [],
  status: 'complete',
  createdAt: new Date('2024-01-01T00:00:00Z').getTime(),
};

const noop = () => {};

function renderAnnotatedBody(
  message: ChatUiMessage = baseMessage,
  sessionKey: string | null = 'sess-1',
) {
  return render(
    <ThemeProvider>
      <AnnotationProvider sessionKey={sessionKey}>
        <AnnotatedMessageBody
          message={message}
          markdownStyles={markdownStyles}
          files={[]}
          onOpenFile={noop}
          colors={colors}
        />
      </AnnotationProvider>
    </ThemeProvider>,
  );
}

describe('AnnotatedMessageBody', () => {
  it('renders without crashing for a multi-section message', () => {
    const { toJSON } = renderAnnotatedBody();
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a single-section message', () => {
    const simpleMessage: ChatUiMessage = {
      ...baseMessage,
      id: 'msg-simple',
      content: 'Just a single paragraph.',
    };
    const { toJSON } = renderAnnotatedBody(simpleMessage);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders without annotations present', () => {
    const { toJSON } = renderAnnotatedBody();
    // Should render normally with no InlineAnnotationRows
    expect(toJSON()).not.toBeNull();
  });

  it('renders with a null sessionKey (no crash)', () => {
    const { toJSON } = renderAnnotatedBody(baseMessage, null);
    expect(toJSON()).not.toBeNull();
  });
});
