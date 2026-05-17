import React from 'react';
import { Linking, Text } from 'react-native';
import Markdown, { type RenderRules } from '@ronradtke/react-native-markdown-display';
import type { AgentFile } from '@/lib/openclaw/types';
import { type MarkdownStyles, chatMarkdownIt } from '@/utils/markdownTheme';
import { extractBareHref, findAgentFileMatch, isInternalLink } from '@/utils/links';
import { getCachedMarkdownAst } from '@/utils/markdownCache';

export function makeParagraphRule(paragraphStyle: object) {
  return function ParagraphRule(
    node: { key?: string },
    children: React.ReactNode,
  ): React.JSX.Element {
    return (
      <Text key={node.key} style={paragraphStyle}>
        {children}
      </Text>
    );
  };
}

export function makeLinkRule(
  files: AgentFile[],
  onOpenFile: (name: string) => void,
  linkStyle: object,
  textStyle: object,
) {
  return function LinkRule(
    node: { key?: string; attributes?: { href?: string } },
    children: React.ReactNode,
  ): React.JSX.Element {
    const href = String(node.attributes?.href ?? '');
    if (!isInternalLink(href)) {
      return (
        <Text
          key={node.key}
          style={linkStyle}
          accessibilityRole="link"
          onPress={() => { void Linking.openURL(href); }}
        >
          {children}
        </Text>
      );
    }
    const match = findAgentFileMatch(href, files);
    const fileName = match?.name ?? extractBareHref(href) ?? href;
    return (
      <Text
        key={node.key}
        style={linkStyle}
        accessibilityRole="link"
        onPress={() => onOpenFile(fileName)}
      >
        {children}
      </Text>
    );
  };
}

// Stable noop so the library's internal useMemo doesn't re-create the AstRenderer on every render.
export const NOOP_ON_LINK_PRESS = (): boolean => false;

interface CachedMarkdownProps {
  content: string;
  cacheable: boolean;
  markdownStyles: MarkdownStyles;
  rules: RenderRules;
}

// Memoized: settled paragraphs render the same content + styles + rules across
// streaming chunks, so React.memo's shallow compare lets them short-circuit.
export const CachedMarkdown = React.memo(function CachedMarkdown({
  content,
  cacheable,
  markdownStyles,
  rules,
}: CachedMarkdownProps): React.JSX.Element {
  const cachedAst = cacheable ? getCachedMarkdownAst(content, chatMarkdownIt) : null;
  const children = (cachedAst ?? content) as unknown as string;
  return (
    <Markdown
      style={markdownStyles}
      markdownit={chatMarkdownIt}
      rules={rules}
      onLinkPress={NOOP_ON_LINK_PRESS}
    >
      {children}
    </Markdown>
  );
});
