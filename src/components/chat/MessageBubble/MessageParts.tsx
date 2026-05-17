import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type RenderRules } from '@ronradtke/react-native-markdown-display';
import { BorderRadius, Spacing } from '@/constants/theme';
import type { AgentFile } from '@/lib/openclaw/types';
import type { ThemeColors } from '@/types';
import type { ChatUiMessagePart, ChatUiThinkingBlock } from '@/types/chat-ui';
import { type MarkdownStyles } from '@/utils/markdownTheme';
import { stripClawboyDirectivesForRender } from '@/lib/openclaw/interactive';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { markdownFenceRule } from '../CodeBlock';
import { StreamingText } from '../StreamingText';
import { ThinkingNode } from '../ThinkingNode';
import { ToolCallCard } from '../ToolCallCard';
import { ToolCallGroup } from '../ToolCallGroup';
import { makeParagraphRule, makeLinkRule } from './CachedMarkdown';
import { StreamingBottomFade } from './StreamingBottomFade';
import { ParagraphRevealRenderer } from './ParagraphRevealRenderer';
import { MarkdownErrorFallback } from './MarkdownErrorFallback';

interface StreamingTextPartProps {
  partId: string;
  text: string;
  isStreamingTail: boolean;
  markdownStyles: MarkdownStyles;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  colors: ThemeColors;
}

const StreamingTextPart = React.memo(function StreamingTextPart({
  partId,
  text,
  isStreamingTail,
  markdownStyles,
  files,
  onOpenFile,
  colors,
}: StreamingTextPartProps): React.JSX.Element | null {
  const isTyping = isStreamingTail && !text;
  const trimmed = useMemo(
    () => stripClawboyDirectivesForRender(text.trimEnd()),
    [text],
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

  return (
    <View style={[partsStyles.bubble, partsStyles.aiBubble]}>
      {isTyping ? (
        <StreamingText />
      ) : (
        <StreamingBottomFade active={isStreamingTail && trimmed.length > 0} tintColor={colors.background}>
          <ErrorBoundary fallback={() => <MarkdownErrorFallback content={trimmed} />}>
            <ParagraphRevealRenderer
              messageId={partId}
              content={trimmed}
              isStreaming={isStreamingTail}
              markdownStyles={markdownStyles}
              rules={rules}
            />
          </ErrorBoundary>
        </StreamingBottomFade>
      )}
    </View>
  );
});

interface MessagePartsProps {
  parts: ChatUiMessagePart[];
  isStreaming: boolean;
  showThinking: boolean;
  showToolCalls: boolean;
  colors: ThemeColors;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  markdownStyles: MarkdownStyles;
}

export const MessageParts = React.memo(function MessageParts({
  parts,
  isStreaming,
  showThinking,
  showToolCalls,
  files,
  onOpenFile,
  markdownStyles,
  colors,
}: MessagePartsProps): React.JSX.Element | null {
  if (parts.length === 0) return null;

  // Precompute hasNext for each thinking/tool part.
  const hasNextMap = new Map<string, boolean>();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.kind === 'thinking' && !showThinking) continue;
    if (part.kind === 'tool' && !showToolCalls) continue;
    if (part.kind !== 'thinking' && part.kind !== 'tool') continue;
    let hasNext = false;
    for (let j = i + 1; j < parts.length; j++) {
      const next = parts[j];
      if (!next) continue;
      if (next.kind === 'text') break;
      if (next.kind === 'thinking' && showThinking) { hasNext = true; break; }
      if (next.kind === 'tool' && showToolCalls) { hasNext = true; break; }
    }
    hasNextMap.set(part.id, hasNext);
  }

  const elements: React.JSX.Element[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    if (part.kind === 'thinking') {
      if (!showThinking) continue;
      const thinkingBlock: ChatUiThinkingBlock = {
        id: part.id,
        content: part.text,
        isExpanded: false,
        duration: part.duration,
      };
      elements.push(
        <ThinkingNode
          key={part.id}
          thinking={thinkingBlock}
          isActive={part.isActive && isStreaming}
          hasNext={hasNextMap.get(part.id) ?? false}
        />,
      );
      continue;
    }

    if (part.kind === 'tool') {
      if (!showToolCalls) { continue; }
      // Collect consecutive tool parts into a run.
      const runParts = [part];
      let j = i + 1;
      while (j < parts.length) {
        const next = parts[j];
        if (!next || next.kind !== 'tool') break;
        runParts.push(next);
        j++;
      }
      const runEnd = j - 1;

      if (runParts.length >= 3) {
        const toolCalls = runParts.map(p => p.toolCall);
        const durations: Record<string, string> = {};
        for (const p of runParts) {
          if (p.duration) durations[p.toolCall.id] = p.duration;
        }
        // hasNext: is there a visible thinking/tool part after this run?
        let groupHasNext = false;
        for (let k = runEnd + 1; k < parts.length; k++) {
          const next = parts[k];
          if (!next) continue;
          if (next.kind === 'text') break;
          if (next.kind === 'thinking' && showThinking) { groupHasNext = true; break; }
          if (next.kind === 'tool' && showToolCalls) { groupHasNext = true; break; }
        }
        elements.push(
          <ToolCallGroup
            key={runParts[0]!.id}
            toolCalls={toolCalls}
            durations={durations}
            hasNext={groupHasNext}
          />,
        );
      } else {
        for (const rp of runParts) {
          elements.push(
            <ToolCallCard
              key={rp.id}
              toolCall={rp.toolCall}
              hasNext={hasNextMap.get(rp.id) ?? false}
              duration={rp.duration}
            />,
          );
        }
      }
      i = runEnd;
      continue;
    }

    if (part.kind === 'text') {
      const isLastPart = i === parts.length - 1;
      const isStreamingTail = isStreaming && isLastPart;
      const trimmed = part.text.trimEnd();
      if (!trimmed && !isStreamingTail) continue;

      elements.push(
        <StreamingTextPart
          key={part.id}
          partId={part.id}
          text={part.text}
          isStreamingTail={isStreamingTail}
          markdownStyles={markdownStyles}
          files={files}
          onOpenFile={onOpenFile}
          colors={colors}
        />
      );
    }
  }

  return elements.length > 0 ? <>{elements}</> : null;
});

const partsStyles = StyleSheet.create({
  bubble: {
    maxWidth: '92%',
  },
  aiBubble: {
    paddingVertical: 2,
  },
});
