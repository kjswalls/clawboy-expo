import type { Code } from 'mdast';
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
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import type { RendererArgs } from 'react-native-remark';

import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

type HljsAstNode = {
  type: 'text' | 'element';
  value?: string | number;
  children?: HljsAstNode[];
  properties?: { className?: string[] };
};

type HljsRendererProps = { rows: HljsAstNode[] };

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

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

const TextRenderer = ({ node }: { node: HljsAstNode }) => {
  const value = String(node.value ?? '').replace(/\n/g, ' ');
  return (
    <Text style={{ color: String(atomOneDark.hljs?.color ?? Colors.dark.foreground) }}>
      {value}
    </Text>
  );
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
    <HljsText key={idx} node={child} contentStyle={contentStyle} />
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
    return <TextRenderer node={node} />;
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
      }}
    />
  ));

const ScrollContainer = ({ children }: ScrollViewProps) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
    {children}
  </ScrollView>
);

const CodeContainer = ({ children }: ViewProps) => <View>{children}</View>;

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const lang = language?.trim() ?? '';

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

/** Use with `react-native-remark` to match standalone `CodeBlock` styling. */
export function RemarkCodeBlock({ node }: RendererArgs<Code>): React.JSX.Element {
  return <CodeBlock code={node.value} language={node.lang ?? ''} />;
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
