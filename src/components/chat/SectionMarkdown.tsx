import Markdown from '@ronradtke/react-native-markdown-display';
import React, { useMemo } from 'react';
import { Linking, Text } from 'react-native';
import { chatMarkdownIt, type MarkdownStyles } from '@/utils/markdownTheme';
import { getCachedMarkdownAst } from '@/utils/markdownCache';
import { extractBareHref, findAgentFileMatch, isInternalLink } from '@/utils/links';
import { markdownFenceRule } from './CodeBlock';
import type { AgentFile } from '@/lib/openclaw/types';

// ── Shared markdown rule helpers ─────────────────────────────────────────────

function NOOP_ON_LINK_PRESS(): boolean { return false; }

const SAFE_URL_PROTOCOLS = ['https:', 'http:', 'mailto:'];

function isSafeUrl(url: string): boolean {
  try {
    return SAFE_URL_PROTOCOLS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function makeParagraphRule(paragraphStyle: object) {
  return function ParagraphRule(
    node: { key?: string },
    children: React.ReactNode,
  ): React.JSX.Element {
    return <Text key={node.key} style={paragraphStyle}>{children}</Text>;
  };
}

function makeLinkRule(
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
          style={isSafeUrl(href) ? linkStyle : textStyle}
          accessibilityRole="link"
          onPress={isSafeUrl(href) ? () => { void Linking.openURL(href); } : undefined}
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

// ── SectionMarkdown component ─────────────────────────────────────────────────

export interface SectionMarkdownProps {
  raw: string;
  markdownStyles: MarkdownStyles;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
}

export function SectionMarkdown({
  raw,
  markdownStyles,
  files,
  onOpenFile,
}: SectionMarkdownProps): React.JSX.Element {
  const rules = useMemo(() => ({
    fence: (node: { key?: string; content: string; sourceInfo?: string }) => markdownFenceRule(node),
    paragraph: makeParagraphRule(markdownStyles.paragraph ?? {}),
    link: makeLinkRule(files, onOpenFile, markdownStyles.link ?? {}, markdownStyles.text ?? {}),
  }), [markdownStyles, files, onOpenFile]);

  const cachedAst = getCachedMarkdownAst(raw, chatMarkdownIt);
  const children = (cachedAst ?? raw) as unknown as string;

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
}
