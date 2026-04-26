import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { MessageBubble } from '../MessageBubble';
import { deriveFallbackName } from '../MediaEmbed';
import type { ChatUiMessage } from '@/types/chat-ui';

const NOW = new Date('2024-01-15T12:00:00Z');

const userMsg: ChatUiMessage = {
  id: 'msg-user-1',
  role: 'user',
  content: 'Hello, can you help me with something?',
  timestamp: NOW,
};

const aiMsg: ChatUiMessage = {
  id: 'msg-ai-1',
  role: 'assistant',
  content: 'Of course! I am here to help.',
  timestamp: NOW,
};

describe('MessageBubble', () => {
  it('renders a user message', () => {
    const { toJSON } = renderWithProviders(<MessageBubble message={userMsg} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an AI message', () => {
    const { toJSON } = renderWithProviders(<MessageBubble message={aiMsg} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an AI message with thinking blocks', () => {
    const msg: ChatUiMessage = {
      ...aiMsg,
      thinking: [
        { id: 'think-1', content: 'Let me reason about this...', isExpanded: false },
      ],
    };
    const { toJSON } = renderWithProviders(<MessageBubble message={msg} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an AI message with tool calls', () => {
    const msg: ChatUiMessage = {
      ...aiMsg,
      toolCalls: [
        { id: 'tc-1', type: 'web_search', name: 'search_web', status: 'completed' },
      ],
    };
    const { toJSON } = renderWithProviders(<MessageBubble message={msg} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a streaming message (typing indicator)', () => {
    const msg: ChatUiMessage = {
      ...aiMsg,
      content: '',
      isStreaming: true,
    };
    const { toJSON } = renderWithProviders(<MessageBubble message={msg} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an interrupted message', () => {
    const msg: ChatUiMessage = {
      ...aiMsg,
      interrupted: true,
    };
    const { toJSON } = renderWithProviders(<MessageBubble message={msg} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('forwards guessedMedia to MediaEmbed (smoke test)', () => {
    const msg: ChatUiMessage = {
      ...aiMsg,
      content: '',
      guessedMedia: true,
      images: ['https://gateway.example.com/media/foo---uuid.jpg?source=%2Fuploads%2Ffoo---uuid.jpg'],
    };
    // Should render without crashing; guessedMedia gate is exercised.
    const { toJSON } = renderWithProviders(<MessageBubble message={msg} />);
    expect(toJSON()).toMatchSnapshot();
  });
});

describe('deriveFallbackName', () => {
  it('prefers the decoded ?source= basename', () => {
    const url = 'https://gw.example.com/media/proxy?source=%2Fuploads%2Ffoo---uuid.jpg';
    expect(deriveFallbackName(url)).toBe('foo---uuid.jpg');
  });

  it('falls back to the URL basename when no ?source=', () => {
    const url = 'https://gw.example.com/media/foo---uuid.png';
    expect(deriveFallbackName(url)).toBe('foo---uuid.png');
  });

  it('handles an invalid URL gracefully', () => {
    expect(deriveFallbackName('not-a-url')).toBe('not-a-url');
  });

  it('handles a URL where the path has no segments', () => {
    const url = 'https://gw.example.com/';
    // last segment of '/' split is '', so falls back to src itself
    const result = deriveFallbackName(url);
    expect(typeof result).toBe('string');
  });
});
