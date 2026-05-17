import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type RenderRules } from '@ronradtke/react-native-markdown-display';
import { BorderRadius, Spacing } from '@/constants/theme';
import type { AgentFile } from '@/lib/openclaw/types';
import type { ThemeColors } from '@/types';
import { type MarkdownStyles } from '@/utils/markdownTheme';
import { stripClawboyDirectivesForRender } from '@/lib/openclaw/interactive';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { markdownFenceRule } from '../CodeBlock';
import { makeParagraphRule, makeLinkRule } from './CachedMarkdown';
import { StreamingBottomFade } from './StreamingBottomFade';
import { ParagraphRevealRenderer } from './ParagraphRevealRenderer';
import { MarkdownErrorFallback } from './MarkdownErrorFallback';

interface MessageBodyProps {
  messageId: string;
  content: string;
  isTyping: boolean;
  isUser: boolean;
  isStreaming: boolean;
  colors: ThemeColors;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  markdownStyles: MarkdownStyles;
}

export const MessageBody = React.memo(function MessageBody({
  messageId,
  content,
  isTyping,
  isUser,
  isStreaming,
  colors,
  files,
  onOpenFile,
  markdownStyles,
}: MessageBodyProps): React.JSX.Element | null {
  const isAssistantStreaming = isStreaming && !isUser;
  const trimmed = useMemo(
    () => stripClawboyDirectivesForRender(content.trimEnd()),
    [content],
  );

  const rules = useMemo(() => ({
    fence: (node: { key?: string; content: string; sourceInfo?: string }) => markdownFenceRule(node),
    paragraph: makeParagraphRule(markdownStyles.paragraph ?? {}),
    link: makeLinkRule(files, onOpenFile, markdownStyles.link ?? {}, markdownStyles.text ?? {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }) as RenderRules,
    [markdownStyles.paragraph, markdownStyles.text, markdownStyles.link, files, onOpenFile],
  );

  if (!trimmed && !isTyping) return null;
  if (isTyping) return null;

  return (
    <View
      style={[
        bodyStyles.bubble,
        isUser
          ? [bodyStyles.userBubble, { backgroundColor: colors.userBubble }]
          : bodyStyles.aiBubble,
      ]}
    >
      <StreamingBottomFade active={isAssistantStreaming && trimmed.length > 0}>
        <ErrorBoundary fallback={() => <MarkdownErrorFallback content={trimmed} />}>
          <ParagraphRevealRenderer
            messageId={messageId}
            content={trimmed}
            isStreaming={isAssistantStreaming}
            markdownStyles={markdownStyles}
            rules={rules}
          />
        </ErrorBoundary>
      </StreamingBottomFade>
    </View>
  );
});

const bodyStyles = StyleSheet.create({
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
});
