import React, { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewProps,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/hljs/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/hljs/diff';
import go from 'react-syntax-highlighter/dist/esm/languages/hljs/go';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import markdown from 'react-syntax-highlighter/dist/esm/languages/hljs/markdown';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/hljs/rust';
import shell from 'react-syntax-highlighter/dist/esm/languages/hljs/shell';
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';
import swift from 'react-syntax-highlighter/dist/esm/languages/hljs/swift';
import typescript from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import xml from 'react-syntax-highlighter/dist/esm/languages/hljs/xml';
import yaml from 'react-syntax-highlighter/dist/esm/languages/hljs/yaml';

SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('shell', shell);
SyntaxHighlighter.registerLanguage('sh', shell);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('swift', swift);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('javascript', typescript);
SyntaxHighlighter.registerLanguage('js', typescript);
SyntaxHighlighter.registerLanguage('tsx', typescript);
SyntaxHighlighter.registerLanguage('jsx', typescript);
SyntaxHighlighter.registerLanguage('xml', xml);
SyntaxHighlighter.registerLanguage('html', xml);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);

import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

type HljsAstNode = {
  type: 'text' | 'element';
  value?: string | number;
  children?: HljsAstNode[];
  properties?: { className?: string[] };
};

type HljsRendererProps = { rows: HljsAstNode[] };

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const DEFAULT_HLJS_COLOR = String(atomOneDark.hljs?.color ?? Colors.dark.foreground);

function mergeTextStyle(a: TextStyle | undefined, b: TextStyle): TextStyle {
  return { ...a, ...b };
}

function hljsStyleForClass(
  classNames: string[],
  base: TextStyle | undefined,
): TextStyle {
  let style: TextStyle = mergeTextStyle(base, {});
  for (const className of classNames) {
    const token = atomOneDark[className as keyof typeof atomOneDark];
    if (token && typeof token === 'object') {
      const t = token as { color?: string; fontStyle?: string; fontWeight?: string | number };
      if (t.color) {
        style = mergeTextStyle(style, { color: t.color });
      }
      if (t.fontStyle === 'italic') {
        style = mergeTextStyle(style, { fontStyle: 'italic' });
      }
      if (t.fontWeight === 'bold' || t.fontWeight === 700) {
        style = mergeTextStyle(style, { fontWeight: '700' });
      }
    }
  }
  return style;
}

const TextRenderer = ({
  node,
  contentStyle,
}: {
  node: HljsAstNode;
  contentStyle?: TextStyle;
}) => {
  const value = String(node.value ?? '').replace(/\n/g, ' ');
  return <Text style={contentStyle}>{value}</Text>;
};

const ElementRenderer = ({
  node,
  contentStyle,
}: {
  node: HljsAstNode;
  contentStyle?: TextStyle;
}) => {
  const classNames = node.properties?.className ?? [];
  const style = hljsStyleForClass(
    classNames.filter((c): c is string => typeof c === 'string'),
    contentStyle,
  );
  const children = node.children?.map((child, idx) => (
    <HljsText key={idx} node={child} contentStyle={style} />
  ));
  return <Text style={style}>{children}</Text>;
};

function HljsText({
  node,
  contentStyle,
}: {
  node: HljsAstNode;
  contentStyle?: TextStyle;
}) {
  if (node.type === 'text') {
    return <TextRenderer node={node} contentStyle={contentStyle} />;
  }
  return <ElementRenderer node={node} contentStyle={contentStyle} />;
}

const nativeRenderer = (): ((props: HljsRendererProps) => React.ReactNode) => (props: HljsRendererProps) =>
  props.rows.map((row, idx) => (
    <HljsText
      key={idx}
      node={row}
      contentStyle={{
        fontFamily: mono,
        fontSize: FontSize.sm,
        color: DEFAULT_HLJS_COLOR,
      }}
    />
  ));

// RN's horizontal ScrollView defaults to `flexGrow: 1, flexShrink: 1`, which makes
// it claim all available vertical slack from its ancestors (flex: 1 chain up to
// the viewport). Inside a FlatList cell that inflates the cell to full screen
// height, producing a massive empty void below the content. Forcing
// flexGrow: 0 / flexShrink: 0 makes it hug its content, same as a plain <View>.
const ScrollContainer = ({ children }: ScrollViewProps) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator
    style={[styles.codeScroll, { flexGrow: 0, flexShrink: 0 }]}
  >
    {children}
  </ScrollView>
);

const CodeContainer = ({ children }: ViewProps) => <View>{children}</View>;

interface CodeBlockProps {
  code: string;
  language?: string;
}

function normalizeFenceLanguage(language?: string): string {
  const raw = language?.trim().toLowerCase() ?? '';
  if (!raw) {
    return '';
  }

  // Supports markdown fence metadata like "tsx", "tsx {1-3}", or "language-tsx".
  const withoutPrefix = raw.replace(/^language-/, '');
  const candidate = withoutPrefix.split(/[{\s]/)[0];
  return candidate?.trim() ?? '';
}

export function CodeBlock({ code, language }: CodeBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const lang = normalizeFenceLanguage(language);

  return (
    <View style={styles.wrap}>
      {lang.length > 0 ? (
        <View style={styles.headerRow}>
          <Text style={styles.lang}>{lang}</Text>
          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [styles.copyPill, pressed && styles.copyPillPressed]}
          >
            {copied ? (
              <>
                <Check size={12} color={Colors.dark.mutedForeground} />
                <Text style={styles.copyLabel}>Copied</Text>
              </>
            ) : (
              <>
                <Copy size={12} color={Colors.dark.mutedForeground} />
                <Text style={styles.copyLabel}>Copy</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
      <View style={styles.codeBody}>
        <SyntaxHighlighter
          language={lang || 'plaintext'}
          style={atomOneDark}
          renderer={nativeRenderer() as never}
          PreTag={ScrollContainer}
          CodeTag={CodeContainer}
        >
          {code}
        </SyntaxHighlighter>
        {lang.length === 0 ? (
          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [styles.floatingCopy, pressed && styles.copyPillPressed]}
          >
            {copied ? (
              <Check size={16} color={Colors.dark.mutedForeground} />
            ) : (
              <Copy size={16} color={Colors.dark.mutedForeground} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Custom rule for `@ronradtke/react-native-markdown-display` fenced code blocks. */
export function markdownFenceRule(
  node: { key?: string; content: string; sourceInfo?: string },
): React.JSX.Element {
  return <CodeBlock key={node.key} code={node.content} language={node.sourceInfo ?? ''} />;
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: 'rgba(26, 31, 46, 0.8)',
    marginVertical: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.dark.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  lang: {
    fontSize: FontSize.xs,
    fontFamily: mono,
    color: Colors.dark.mutedForeground,
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  copyPillPressed: {
    opacity: 0.7,
  },
  copyLabel: {
    fontSize: FontSize.xs,
    color: Colors.dark.mutedForeground,
  },
  codeBody: {
    position: 'relative',
    backgroundColor: Colors.dark.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  codeScroll: {
    paddingVertical: Spacing.sm,
  },
  floatingCopy: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    padding: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(26, 31, 46, 0.8)',
  },
});
