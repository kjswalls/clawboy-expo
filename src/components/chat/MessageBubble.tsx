import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import Markdown from '@ronradtke/react-native-markdown-display';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AlertTriangle, Check, Copy, RotateCcw, Volume2, VolumeX } from 'lucide-react-native';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { ChatUiMessage, ChatUiMessagePart, ChatUiThinkingBlock, ChatUiToolCall } from '@/types/chat-ui';
import { formatMessageTime } from '@/utils/formatting';
import { chatMarkdownIt, createMarkdownStyles } from '@/utils/markdownTheme';

import { markdownFenceRule } from './CodeBlock';
import { FileAttachmentCard } from './FileAttachmentCard';
import { MediaEmbed } from './MediaEmbed';
import { StreamingText } from './StreamingText';
import { ThinkingNode } from './ThinkingNode';
import { ToolCallCard } from './ToolCallCard';

// ---------------------------------------------------------------------------
// MessageBlocks — owns internalBlockHeights state so layout updates here
// do NOT re-render the Markdown body below.
// ---------------------------------------------------------------------------

interface MessageBlocksProps {
  thinking: ChatUiThinkingBlock[] | undefined;
  toolCalls: ChatUiToolCall[] | undefined;
  showThinking: boolean;
  showToolCalls: boolean;
  isStreaming: boolean;
}

const MessageBlocks = React.memo(function MessageBlocks({
  thinking,
  toolCalls,
  showThinking,
  showToolCalls,
  isStreaming,
}: MessageBlocksProps): React.JSX.Element | null {
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});

  const recordBlockHeight = useCallback((id: string, height: number): void => {
    setBlockHeights((prev) => {
      const n = Math.round(height);
      if (prev[id] === n) return prev;
      return { ...prev, [id]: n };
    });
  }, []);

  const hasThinking = showThinking && thinking && thinking.length > 0;
  const hasToolCalls = showToolCalls && toolCalls && toolCalls.length > 0;
  if (!hasThinking && !hasToolCalls) return null;

  return (
    <View style={styles.blocks}>
      {hasThinking
        ? thinking.map((t, index, arr) => {
            const prevId = index > 0 ? arr[index - 1]?.id : undefined;
            const previousBlockHeight = prevId ? blockHeights[prevId] : undefined;
            return (
              <View
                key={t.id}
                onLayout={(e) => recordBlockHeight(t.id, e.nativeEvent.layout.height)}
              >
                <ThinkingNode
                  thinking={t}
                  isActive={Boolean(isStreaming && index === arr.length - 1)}
                  showConnector={index > 0}
                  previousBlockHeight={previousBlockHeight}
                />
              </View>
            );
          })
        : null}
      {hasToolCalls
        ? toolCalls.map((tc, index, arr) => {
            const hasBefore = Boolean(hasThinking) || index > 0;
            let prevId: string | undefined;
            if (index > 0) {
              prevId = arr[index - 1]?.id;
            } else if (thinking != null && thinking.length > 0) {
              prevId = thinking[thinking.length - 1]?.id;
            }
            const previousBlockHeight = prevId ? blockHeights[prevId] : undefined;
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
  );
});

// ---------------------------------------------------------------------------
// MessageParts — renders an ordered parts array (live streaming path).
// Thinking nodes, tool cards, and text blocks appear in true arrival order.
// Falls back to MessageBlocks + MessageBody when parts are absent (history).
// ---------------------------------------------------------------------------

interface MessagePartsProps {
  parts: ChatUiMessagePart[];
  isStreaming: boolean;
  showThinking: boolean;
  showToolCalls: boolean;
  colors: Colors;
}

const MessageParts = React.memo(function MessageParts({
  parts,
  isStreaming,
  showThinking,
  showToolCalls,
  colors,
}: MessagePartsProps): React.JSX.Element | null {
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);

  const recordBlockHeight = useCallback((id: string, height: number): void => {
    setBlockHeights((prev) => {
      const n = Math.round(height);
      if (prev[id] === n) return prev;
      return { ...prev, [id]: n };
    });
  }, []);

  if (parts.length === 0) return null;

  const elements: React.JSX.Element[] = [];
  let prevVisibleInternalId: string | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.kind === 'thinking') {
      if (!showThinking) continue;
      const showConnector = prevVisibleInternalId !== undefined;
      const prevId = prevVisibleInternalId;
      prevVisibleInternalId = part.id;

      const thinkingBlock: ChatUiThinkingBlock = {
        id: part.id,
        content: part.text,
        isExpanded: false,
        duration: part.duration,
      };
      elements.push(
        <View
          key={part.id}
          onLayout={(e) => recordBlockHeight(part.id, e.nativeEvent.layout.height)}
        >
          <ThinkingNode
            thinking={thinkingBlock}
            isActive={part.isActive && isStreaming}
            showConnector={showConnector}
            previousBlockHeight={prevId ? blockHeights[prevId] : undefined}
          />
        </View>
      );
      continue;
    }

    if (part.kind === 'tool') {
      if (!showToolCalls) continue;
      const showConnector = prevVisibleInternalId !== undefined;
      const prevId = prevVisibleInternalId;
      prevVisibleInternalId = part.id;

      elements.push(
        <View
          key={part.id}
          onLayout={(e) => recordBlockHeight(part.id, e.nativeEvent.layout.height)}
        >
          <ToolCallCard
            toolCall={part.toolCall}
            showConnector={showConnector}
            previousBlockHeight={prevId ? blockHeights[prevId] : undefined}
            duration={part.duration}
          />
        </View>
      );
      continue;
    }

    if (part.kind === 'text') {
      // Text breaks the connector chain between internal blocks.
      prevVisibleInternalId = undefined;
      const isLastPart = i === parts.length - 1;
      // "Streaming tail" — the text part that is still actively growing.
      // Render as plain <Text> to skip markdown-it parsing on every RAF frame.
      // Once isStreaming is false (or another part follows), it renders through
      // <Markdown> exactly once.
      const isStreamingTail = isStreaming && isLastPart;
      const isTyping = isStreamingTail && !part.text;
      const trimmed = part.text.trimEnd();
      if (!trimmed && !isTyping) continue;

      elements.push(
        <View
          key={part.id}
          style={[styles.bubble, styles.aiBubble]}
        >
          {isTyping ? (
            <StreamingText />
          ) : isStreamingTail ? (
            <Text style={markdownStyles.paragraph as object}>{trimmed}</Text>
          ) : (
            <ErrorBoundary fallback={() => <MarkdownErrorFallback content={trimmed} />}>
              <Markdown
                style={markdownStyles}
                markdownit={chatMarkdownIt}
                rules={{ fence: (node) => markdownFenceRule(node) }}
                onLinkPress={(url) => {
                  void Linking.openURL(url);
                  return true;
                }}
              >
                {trimmed}
              </Markdown>
            </ErrorBoundary>
          )}
        </View>
      );
    }
  }

  return elements.length > 0 ? <>{elements}</> : null;
});

// ---------------------------------------------------------------------------
// MessageBody — memoized so it only re-renders when content or colors change,
// not when block layout heights update in MessageBlocks above.
// ---------------------------------------------------------------------------

type Colors = ReturnType<typeof useTheme>['colors'];

// Stable module-level fallback so React.memo on MessageBubble stays effective.
function MarkdownErrorFallback({ content }: { content: string }): React.JSX.Element {
  const onLongPress = useCallback(async () => {
    if (content) await Clipboard.setStringAsync(content);
  }, [content]);

  return (
    <Pressable onLongPress={onLongPress} accessibilityLabel="Couldn't render message — long-press to copy raw">
      <Text style={styles.markdownError}>
        Couldn't render this message — long-press to copy raw.
      </Text>
    </Pressable>
  );
}

interface MessageBodyProps {
  content: string;
  isTyping: boolean;
  isUser: boolean;
  isStreaming: boolean;
  colors: Colors;
}

const MessageBody = React.memo(function MessageBody({
  content,
  isTyping,
  isUser,
  isStreaming,
  colors,
}: MessageBodyProps): React.JSX.Element | null {
  const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);
  const trimmed = content.trimEnd();

  if (!trimmed && !isTyping) return null;

  return (
    <View
      style={[
        styles.bubble,
        isUser
          ? [styles.userBubble, { backgroundColor: colors.userBubble }]
          : styles.aiBubble,
      ]}
    >
      {isTyping ? (
        <StreamingText />
      ) : isStreaming && !isUser ? (
        // Skip markdown-it parsing on every RAF frame while the assistant is
        // actively streaming. Swap to full <Markdown> once the stream ends.
        <Text style={markdownStyles.paragraph as object}>{trimmed}</Text>
      ) : (
        <ErrorBoundary fallback={() => <MarkdownErrorFallback content={trimmed} />}>
          <Markdown
            style={markdownStyles}
            markdownit={chatMarkdownIt}
            rules={{ fence: (node) => markdownFenceRule(node) }}
            onLinkPress={(url) => {
              void Linking.openURL(url);
              return true;
            }}
          >
            {trimmed}
          </Markdown>
        </ErrorBoundary>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatUiMessage;
  showThinking?: boolean;
  showToolCalls?: boolean;
  onRetry?: (assistantMessageId: string) => void;
  onSpeak?: (message: ChatUiMessage) => void;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  showThinking = true,
  showToolCalls = true,
  onRetry,
  onSpeak,
}: MessageBubbleProps): React.JSX.Element {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const isUser = message.role === 'user';
  // Show typing dots only when streaming has started but no prose has arrived yet.
  // When parts are present, MessageParts handles typing-dot rendering per text part.
  const hasParts = !isUser && Boolean(message.parts?.length);
  const trimmedContent = message.content?.trim() ?? '';
  const hasVisibleBody =
    Boolean(trimmedContent) ||
    Boolean(message.images?.length) ||
    Boolean(message.fileAttachments?.length) ||
    Boolean(message.files?.length) ||
    Boolean(message.audioUrl) ||
    Boolean(message.videoUrl);
  const isTyping = Boolean(message.isStreaming && !hasVisibleBody && !hasParts);

  const onCopy = useCallback(async () => {
    if (!trimmedContent) return;
    await Clipboard.setStringAsync(trimmedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [trimmedContent]);

  const handleRetry = useCallback(() => {
    onRetry?.(message.id);
  }, [onRetry, message.id]);

  const handleSpeak = useCallback((): void => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    onSpeak?.(message);
    // Reset indicator after 4 s max — actual speech duration varies
    setTimeout(() => setSpeaking(false), 4000);
  }, [speaking, onSpeak, message]);

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      style={[styles.col, isUser ? styles.alignEnd : styles.alignStart]}
    >
      {hasParts ? (
        <MessageParts
          parts={message.parts!}
          isStreaming={Boolean(message.isStreaming)}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          colors={colors}
        />
      ) : (
        <>
          <MessageBlocks
            thinking={message.thinking}
            toolCalls={message.toolCalls}
            showThinking={showThinking}
            showToolCalls={showToolCalls}
            isStreaming={Boolean(message.isStreaming)}
          />
          <MessageBody
            content={message.content}
            isTyping={isTyping}
            isUser={isUser}
            isStreaming={Boolean(message.isStreaming)}
            colors={colors}
          />
        </>
      )}

      {!hasParts &&
      isUser &&
      message.fileAttachments &&
      message.fileAttachments.length > 0 ? (
        <View style={[styles.fileAttachRow, styles.alignEnd]}>
          {message.fileAttachments.map((f, i) => (
            <View
              key={`${f.name}-${String(i)}`}
              style={[
                styles.fileAttachPill,
                { backgroundColor: colors.userBubble, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.fileAttachText, { color: colors.foreground }]} numberOfLines={1}>
                {f.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <MediaEmbed
        images={message.images}
        audioUrl={message.audioUrl}
        videoUrl={message.videoUrl}
        align={isUser ? 'right' : 'left'}
        guessedMedia={message.guessedMedia}
      />

      {message.files && message.files.length > 0 ? (
        <View style={isUser ? styles.alignEnd : styles.alignStart}>
          {message.files.map((f, i) => (
            <FileAttachmentCard key={`${f.url}-${String(i)}`} file={f} guessedMedia={message.guessedMedia} />
          ))}
        </View>
      ) : null}

      {message.interrupted && !isUser ? (
        <Pressable
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.interruptedPill,
            { backgroundColor: colors.secondary, borderColor: colors.warning ?? '#F59E0B' },
            pressed && { opacity: 0.75 },
          ]}
          hitSlop={6}
          accessibilityLabel="Retry interrupted response"
          accessibilityRole="button"
        >
          <AlertTriangle size={11} color={colors.warning ?? '#F59E0B'} />
          <Text style={[styles.interruptedText, { color: colors.warning ?? '#F59E0B' }]}>
            Interrupted
          </Text>
          {onRetry ? (
            <>
              <View style={[styles.interruptedDivider, { backgroundColor: colors.warning ?? '#F59E0B' }]} />
              <RotateCcw size={11} color={colors.warning ?? '#F59E0B'} />
              <Text style={[styles.interruptedText, { color: colors.warning ?? '#F59E0B' }]}>
                Retry
              </Text>
            </>
          ) : null}
        </Pressable>
      ) : null}

      <View style={[styles.meta, isUser ? styles.metaEnd : styles.metaStart]}>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {formatMessageTime(message.timestamp)}
        </Text>
        {trimmedContent ? (
          <Pressable
            onPress={onCopy}
            hitSlop={8}
            style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Copy message"
            accessibilityRole="button"
          >
            {copied ? (
              <Check size={12} color={colors.success} />
            ) : (
              <Copy size={12} color="rgba(139, 139, 139, 0.5)" />
            )}
          </Pressable>
        ) : null}
        {!isUser && trimmedContent && onSpeak ? (
          <Pressable
            onPress={handleSpeak}
            hitSlop={8}
            style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={speaking ? 'Stop speaking' : 'Read aloud'}
            accessibilityRole="button"
          >
            {speaking ? (
              <VolumeX size={12} color={colors.primary} />
            ) : (
              <Volume2 size={12} color="rgba(139, 139, 139, 0.5)" />
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
  fileAttachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    maxWidth: '92%',
  },
  fileAttachPill: {
    maxWidth: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  fileAttachText: {
    fontSize: FontSize.sm,
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
  interruptedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  interruptedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  interruptedDivider: {
    width: 1,
    height: 10,
    opacity: 0.4,
    marginHorizontal: 2,
  },
  markdownError: {
    fontSize: 12,
    color: 'rgba(168, 85, 247, 0.7)',
    fontStyle: 'italic',
  },
});
