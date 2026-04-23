import * as Clipboard from 'expo-clipboard';
import Markdown from '@ronradtke/react-native-markdown-display';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Check, Copy } from 'lucide-react-native';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { ChatUiMessage } from '@/types/chat-ui';
import { formatMessageTime } from '@/utils/formatting';
import { createMarkdownStyles } from '@/utils/markdownTheme';

import { markdownFenceRule } from './CodeBlock';
import { MediaEmbed } from './MediaEmbed';
import { StreamingText } from './StreamingText';
import { ThinkingNode } from './ThinkingNode';
import { ToolCallCard } from './ToolCallCard';

interface MessageBubbleProps {
  message: ChatUiMessage;
  isLatestAssistant?: boolean;
  showThinking?: boolean;
  showToolCalls?: boolean;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isLatestAssistant: _isLatestAssistant = false,
  showThinking = true,
  showToolCalls = true,
}: MessageBubbleProps): React.JSX.Element {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const [internalBlockHeights, setInternalBlockHeights] = useState<Record<string, number>>({});

  const recordBlockHeight = useCallback((id: string, height: number): void => {
    setInternalBlockHeights((prev) => {
      const n = Math.round(height);
      if (prev[id] === n) {
        return prev;
      }
      return { ...prev, [id]: n };
    });
  }, []);
  const isUser = message.role === 'user';
  const isStreaming = Boolean(message.isStreaming && !message.content);

  const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);

  const onCopy = useCallback(async () => {
    if (!message.content) {
      return;
    }
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const showBlocks =
    (showThinking && message.thinking && message.thinking.length > 0) ||
    (showToolCalls && message.toolCalls && message.toolCalls.length > 0);

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      style={[styles.col, isUser ? styles.alignEnd : styles.alignStart]}
    >
      {showBlocks ? (
        <View style={styles.blocks}>
          {showThinking && message.thinking
            ? message.thinking.map((t, index, thinkingBlocks) => {
                const prevBlock = index > 0 ? thinkingBlocks[index - 1] : undefined;
                const prevId = prevBlock?.id;
                const previousBlockHeight = prevId
                  ? internalBlockHeights[prevId]
                  : undefined;
                return (
                  <View
                    key={t.id}
                    onLayout={(e) => recordBlockHeight(t.id, e.nativeEvent.layout.height)}
                  >
                    <ThinkingNode
                      thinking={t}
                      isActive={Boolean(
                        message.isStreaming && index === thinkingBlocks.length - 1,
                      )}
                      showConnector={index > 0}
                      previousBlockHeight={previousBlockHeight}
                    />
                  </View>
                );
              })
            : null}
          {showToolCalls && message.toolCalls
            ? message.toolCalls.map((tc, index, toolCallsBlocks) => {
                const hasBefore =
                  Boolean(showThinking && message.thinking && message.thinking.length > 0) ||
                  index > 0;
                const thinkingBlocks = message.thinking;
                let prevId: string | undefined;
                if (index > 0) {
                  prevId = toolCallsBlocks[index - 1]?.id;
                } else if (thinkingBlocks != null && thinkingBlocks.length > 0) {
                  prevId = thinkingBlocks[thinkingBlocks.length - 1]?.id;
                } else {
                  prevId = undefined;
                }
                const previousBlockHeight = prevId
                  ? internalBlockHeights[prevId]
                  : undefined;
                return (
                  <View
                    key={tc.id}
                    onLayout={(e) => recordBlockHeight(tc.id, e.nativeEvent.layout.height)}
                  >
                    <ToolCallCard
                      toolCall={tc}
                      showConnector={hasBefore}
                      previousBlockHeight={previousBlockHeight}
                    />
                  </View>
                );
              })
            : null}
        </View>
      ) : null}

      {message.content || isStreaming ? (
        <View
          style={[
            styles.bubble,
            isUser ? [styles.userBubble, { backgroundColor: colors.userBubble }] : styles.aiBubble,
          ]}
        >
          {isStreaming ? (
            <StreamingText />
          ) : (
            <Markdown
              style={markdownStyles}
              rules={{ fence: (node) => markdownFenceRule(node) }}
              onLinkPress={(url) => { void Linking.openURL(url); return true; }}
            >
              {message.content}
            </Markdown>
          )}
        </View>
      ) : null}

      <MediaEmbed
        images={message.images}
        audioUrl={message.audioUrl}
        align={isUser ? 'right' : 'left'}
      />

      <View style={[styles.meta, isUser ? styles.metaEnd : styles.metaStart]}>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatMessageTime(message.timestamp)}</Text>
        {message.content ? (
          <Pressable
            onPress={onCopy}
            hitSlop={8}
            style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}
          >
            {copied ? (
              <Check size={12} color={colors.success} />
            ) : (
              <Copy size={12} color="rgba(139, 139, 139, 0.5)" />
            )}
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  col: {
    gap: Spacing.sm,
    width: '100%',
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  blocks: {
    width: '100%',
    maxWidth: '92%',
    gap: 4,
  },
  bubble: {
    maxWidth: '92%',
  },
  userBubble: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius['2xl'],
    borderBottomRightRadius: BorderRadius.md,
  },
  aiBubble: {
    paddingVertical: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  metaStart: {
    flexDirection: 'row',
  },
  metaEnd: {
    flexDirection: 'row-reverse',
  },
  time: {
    fontSize: 11,
  },
  copyBtn: {
    padding: 2,
    borderRadius: 4,
  },
});
