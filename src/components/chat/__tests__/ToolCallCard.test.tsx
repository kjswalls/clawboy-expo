import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { ToolCallCard } from '../ToolCallCard';
import type { ChatUiToolCall } from '@/types/chat-ui';

const baseToolCall: ChatUiToolCall = {
  id: 'tc-1',
  type: 'web_search',
  name: 'search_web',
  status: 'completed',
};

describe('ToolCallCard', () => {
  it('renders the pending state', () => {
    const toolCall: ChatUiToolCall = { ...baseToolCall, status: 'pending' };
    const { toJSON } = renderWithProviders(<ToolCallCard toolCall={toolCall} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders the running state', () => {
    const toolCall: ChatUiToolCall = { ...baseToolCall, status: 'running' };
    const { toJSON } = renderWithProviders(<ToolCallCard toolCall={toolCall} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders the completed state', () => {
    const toolCall: ChatUiToolCall = {
      ...baseToolCall,
      status: 'completed',
      input: 'latest React docs',
      output: 'React 19 released...',
    };
    const { toJSON } = renderWithProviders(<ToolCallCard toolCall={toolCall} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders the error state', () => {
    const toolCall: ChatUiToolCall = { ...baseToolCall, status: 'error' };
    const { toJSON } = renderWithProviders(<ToolCallCard toolCall={toolCall} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a file_read type tool call', () => {
    const toolCall: ChatUiToolCall = {
      id: 'tc-2',
      type: 'file_read',
      name: 'read_file',
      status: 'completed',
      input: '/etc/hosts',
      output: '127.0.0.1 localhost',
    };
    const { toJSON } = renderWithProviders(<ToolCallCard toolCall={toolCall} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with connector', () => {
    const { toJSON } = renderWithProviders(
      <ToolCallCard toolCall={baseToolCall} showConnector previousBlockHeight={40} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
