import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ChatUiThinkingBlock, ChatUiToolCall } from '@/types/chat-ui';
import { ThinkingNode } from '../ThinkingNode';
import { ToolCallCard } from '../ToolCallCard';

export interface MessageBlocksProps {
  thinking: ChatUiThinkingBlock[] | undefined;
  toolCalls: ChatUiToolCall[] | undefined;
  showThinking: boolean;
  showToolCalls: boolean;
  isStreaming: boolean;
}

export const MessageBlocks = React.memo(function MessageBlocks({
  thinking,
  toolCalls,
  showThinking,
  showToolCalls,
  isStreaming,
}: MessageBlocksProps): React.JSX.Element | null {
  const hasThinking = showThinking && thinking && thinking.length > 0;
  const hasToolCalls = showToolCalls && toolCalls && toolCalls.length > 0;
  if (!hasThinking && !hasToolCalls) return null;

  return (
    <View style={blocksStyles.blocks}>
      {hasThinking
        ? thinking.map((t, index, arr) => {
            const hasNext = index < arr.length - 1 || Boolean(hasToolCalls);
            return (
              <ThinkingNode
                key={t.id}
                thinking={t}
                isActive={Boolean(isStreaming && index === arr.length - 1)}
                hasNext={hasNext}
              />
            );
          })
        : null}
      {hasToolCalls
        ? toolCalls.map((tc, index, arr) => {
            const hasNext = index < arr.length - 1;
            return (
              <ToolCallCard
                key={tc.id}
                toolCall={tc}
                hasNext={hasNext}
              />
            );
          })
        : null}
    </View>
  );
});

const blocksStyles = StyleSheet.create({
  blocks: {
    width: '100%',
    maxWidth: '92%',
    gap: 4,
  },
});
