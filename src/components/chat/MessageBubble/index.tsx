import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { AgentFile } from '@/lib/openclaw/types';
import type { ThemeColors } from '@/types';
import type { ChatUiMessage } from '@/types/chat-ui';
import { type MarkdownStyles } from '@/utils/markdownTheme';
import { stripClawboyDirectivesForRender } from '@/lib/openclaw/interactive';
import { AnnotatedMessageBody } from '../AnnotatedMessageBody';
import { FileAttachmentCard } from '../FileAttachmentCard';
import { InteractiveOptionsCard } from '../InteractiveOptionsCard';
import { MediaEmbed } from '../MediaEmbed';

import { MessageBlocks } from './MessageBlocks';
import { MessageBody } from './MessageBody';
import { MessageBubbleActions } from './MessageBubbleActions';
import { MessageParts } from './MessageParts';

interface MessageBubbleProps {
  message: ChatUiMessage;
  showThinking?: boolean;
  showToolCalls?: boolean;
  onRetry?: (assistantMessageId: string) => void;
  onSpeak?: (message: ChatUiMessage) => void;
  onReplyToPrompt?: (rawMessage: string) => void;
  onAnnotate?: (message: ChatUiMessage) => void;
  annotateMode?: boolean;
  hasSavedAnnotations?: boolean;
  annotationCount?: number;
  highlightedAnnotationId?: string | null;
  animateOnMount?: boolean;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  markdownStyles: MarkdownStyles;
  colors: ThemeColors;
  onCommentFocus?: (annotationId: string, messageId: string) => void;
  onCommentBlur?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  showThinking = true,
  showToolCalls = true,
  onRetry,
  onSpeak,
  onReplyToPrompt,
  onAnnotate,
  annotateMode = false,
  hasSavedAnnotations = false,
  annotationCount = 0,
  highlightedAnnotationId = null,
  animateOnMount = true,
  files,
  onOpenFile,
  markdownStyles,
  colors,
  onCommentFocus,
  onCommentBlur,
  onLayout,
}: MessageBubbleProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const isUser = message.role === 'user';
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
    await Clipboard.setStringAsync(stripClawboyDirectivesForRender(trimmedContent));
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
    setTimeout(() => setSpeaking(false), 4000);
  }, [speaking, onSpeak, message]);

  const handleAnnotate = useCallback((): void => {
    onAnnotate?.(message);
  }, [onAnnotate, message]);

  const canAnnotate = !isUser && !message.isStreaming && Boolean(trimmedContent) && Boolean(onAnnotate);
  const isAnnotating = canAnnotate && annotateMode;

  const normalBubbleContent = (
    <>
      {hasParts ? (
        <MessageParts
          parts={message.parts!}
          isStreaming={Boolean(message.isStreaming)}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          colors={colors}
          files={files}
          onOpenFile={onOpenFile}
          markdownStyles={markdownStyles}
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
            messageId={message.id}
            content={message.content}
            isTyping={isTyping}
            isUser={isUser}
            isStreaming={Boolean(message.isStreaming)}
            colors={colors}
            files={files}
            onOpenFile={onOpenFile}
            markdownStyles={markdownStyles}
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

      {!isUser && message.interactive && onReplyToPrompt ? (
        <InteractiveOptionsCard
          prompt={message.interactive}
          surveyStates={message.surveyStates ?? {}}
          disabled={Boolean(message.isStreaming)}
          onSubmitMultiReply={onReplyToPrompt}
        />
      ) : null}
    </>
  );

  return (
    <Animated.View
      entering={animateOnMount ? FadeInUp.duration(200) : undefined}
      style={[styles.col, isUser ? styles.alignEnd : styles.alignStart]}
      onLayout={onLayout}
    >
      {isAnnotating ? (
        <View style={styles.annotateGestureTarget}>
          <AnnotatedMessageBody
            message={message}
            markdownStyles={markdownStyles}
            files={files}
            onOpenFile={onOpenFile}
            colors={colors}
            highlightedAnnotationId={highlightedAnnotationId}
          />
        </View>
      ) : canAnnotate ? (
        <Pressable
          onLongPress={handleAnnotate}
          delayLongPress={400}
          style={styles.annotateGestureTarget}
        >
          {normalBubbleContent}
        </Pressable>
      ) : (
        normalBubbleContent
      )}

      {(isUser || !message.isStreaming) && (
        <MessageBubbleActions
          isUser={isUser}
          trimmedContent={trimmedContent}
          timestamp={message.timestamp}
          copied={copied}
          speaking={speaking}
          interrupted={message.interrupted}
          onCopy={onCopy}
          onSpeak={onSpeak ? handleSpeak : undefined}
          onRetry={onRetry ? handleRetry : undefined}
          onAnnotate={canAnnotate ? handleAnnotate : undefined}
          annotateMode={isAnnotating}
          hasSavedAnnotations={hasSavedAnnotations}
          annotationCount={annotationCount}
          colors={colors}
        />
      )}
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
  annotateGestureTarget: {
    width: '100%',
    alignItems: 'stretch',
    gap: Spacing.sm,
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
});
