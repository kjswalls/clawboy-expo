import React from 'react';
import { type RenderRules } from '@ronradtke/react-native-markdown-display';
import { useParagraphReveal } from '@/hooks/useParagraphReveal';
import { type MarkdownStyles } from '@/utils/markdownTheme';
import { CachedMarkdown } from './CachedMarkdown';
import { ParagraphFade } from './ParagraphFade';

export interface ParagraphRevealRendererProps {
  messageId: string;
  content: string;
  isStreaming: boolean;
  markdownStyles: MarkdownStyles;
  rules: RenderRules;
}

export const ParagraphRevealRenderer = React.memo(function ParagraphRevealRenderer({
  messageId,
  content,
  isStreaming,
  markdownStyles,
  rules,
}: ParagraphRevealRendererProps): React.JSX.Element | null {
  const paragraphs = useParagraphReveal(content, isStreaming);
  if (paragraphs.length === 0) return null;
  return (
    <>
      {paragraphs.map((p) => (
        // Scope the key by messageId so an abort-and-retry on the same bubble
        // (which can shrink the paragraph count) doesn't reuse a stale fade.
        <ParagraphFade key={`${messageId}:${p.index}`} animateIn={!p.settled}>
          <CachedMarkdown
            content={p.text}
            cacheable={p.settled}
            markdownStyles={markdownStyles}
            rules={rules}
          />
        </ParagraphFade>
      ))}
    </>
  );
});
