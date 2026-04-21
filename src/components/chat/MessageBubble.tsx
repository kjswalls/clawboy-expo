import * as Clipboard from 'expo-clipboard';
import { Markdown } from 'react-native-remark';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Check, Copy } from 'lucide-react-native';

import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import type { ChatUiMessage } from '@/types/chat-ui';
import { formatMessageTime } from '@/utils/formatting';
import { createMarkdownStyles } from '@/utils/markdownTheme';

import { RemarkCodeBlock } from './CodeBlock';
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
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isStreaming = Boolean(message.isStreaming && !message.content);

  const markdownStyles = useMemo(
    () => ({
      ...createMarkdownStyles(Colors.dark),
      container: { gap: 4, flexGrow: 0 },
    }),
    [],
  );

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
            ? message.thinking.map((t, index) => (
                <ThinkingNode
                  key={t.id}
                  thinking={t}
                  isActive={Boolean(
                    message.isStreaming && index === message.thinking!.length - 1,
                  )}
                  showConnector={index > 0}
                />
              ))
            : null}
          {showToolCalls && message.toolCalls
            ? message.toolCalls.map((tc, index) => {
                const hasBefore =
                  Boolean(showThinking && message.thinking && message.thinking.length > 0) ||
                  index > 0;
                return (
                  <ToolCallCard key={tc.id} toolCall={tc} showConnector={hasBefore} />
                );
              })
            : null}
        </View>
      ) : null}

      {message.content || isStreaming ? (
        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.aiBubble,
          ]}
        >
          {isStreaming ? (
            <StreamingText />
          ) : (
            <View style={styles.mdWrap}>
              <Markdown
                markdown={message.content}
                customStyles={markdownStyles}
                customRenderers={{
                  CodeRenderer: RemarkCodeBlock,
                }}
                onCodeCopy={(code) => Clipboard.setStringAsync(code)}
                onLinkPress={(url) => void Linking.openURL(url)}
              />
            </View>
          )}
        </View>
      ) : null}

      <MediaEmbed
        images={message.images}
        audioUrl={message.audioUrl}
        align={isUser ? 'right' : 'left'}
      />

      <View style={[styles.meta, isUser ? styles.metaEnd : styles.metaStart]}>
        <Text style={styles.time}>{formatMessageTime(message.timestamp)}</Text>
        {message.content ? (
          <Pressable
            onPress={onCopy}
            hitSlop={8}
            style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}
          >
            {copied ? (
              <Check size={12} color={Colors.dark.success} />
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
    backgroundColor: Colors.dark.userBubble,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius['2xl'],
    borderBottomRightRadius: BorderRadius.md,
  },
  aiBubble: {
    paddingVertical: 2,
  },
  mdWrap: {
    flexShrink: 1,
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
    color: Colors.dark.mutedForeground,
  },
  copyBtn: {
    padding: 2,
    borderRadius: 4,
  },
});
