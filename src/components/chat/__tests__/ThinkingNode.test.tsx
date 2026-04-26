import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { ThinkingNode } from '../ThinkingNode';
import type { ChatUiThinkingBlock } from '@/types/chat-ui';

const baseThinking: ChatUiThinkingBlock = {
  id: 'think-1',
  content: 'Analyzing the user request step by step...',
  isExpanded: false,
};

describe('ThinkingNode', () => {
  it('renders in the collapsed (done) state', () => {
    const { toJSON } = renderWithProviders(
      <ThinkingNode thinking={baseThinking} isActive={false} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders in the active (Thinking...) state', () => {
    const { toJSON } = renderWithProviders(
      <ThinkingNode thinking={baseThinking} isActive={true} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with a duration label when thinking is complete', () => {
    const thinkingWithDuration: ChatUiThinkingBlock = {
      ...baseThinking,
      duration: '3s',
    };
    const { toJSON } = renderWithProviders(
      <ThinkingNode thinking={thinkingWithDuration} isActive={false} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with connector when showConnector is true', () => {
    const { toJSON } = renderWithProviders(
      <ThinkingNode thinking={baseThinking} isActive={false} showConnector previousBlockHeight={40} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
