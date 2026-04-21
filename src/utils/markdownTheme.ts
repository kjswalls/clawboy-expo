import { Markdown } from 'react-native-remark';
import { Platform, type TextStyle } from 'react-native';
import type { ComponentProps } from 'react';

import type { ThemeColors } from '@/types';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

type RemarkStyles = NonNullable<ComponentProps<typeof Markdown>['customStyles']>;

/** Dark markdown styles for `react-native-remark` (matches v0 + `constants/theme`). */
export function createMarkdownStyles(colors: ThemeColors): Partial<RemarkStyles> {
  return {
    borderColor: colors.border,
    paragraph: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.foreground,
    },
    text: { color: colors.foreground },
    strong: { fontWeight: '700', color: colors.foreground },
    emphasis: { fontStyle: 'italic', color: colors.foreground },
    link: { color: colors.primary, textDecorationLine: 'underline' },
    linkReference: { color: colors.primary },
    inlineCode: {
      fontFamily: mono,
      fontSize: 14,
      backgroundColor: colors.secondary,
      color: colors.foreground,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    list: { gap: 4 },
    listItem: { gap: 4 },
    heading: (level: number): TextStyle => {
      const sizes = [20, 18, 16];
      const size = sizes[Math.min(level - 1, 2)] ?? 15;
      return {
        fontSize: size,
        fontWeight: level <= 2 ? '700' : '600',
        marginTop: level <= 2 ? 12 : 8,
        marginBottom: 4,
        color: colors.foreground,
      };
    },
    codeBlock: {
      headerBackgroundColor: colors.secondary,
      contentBackgroundColor: colors.background,
      headerTextStyle: {
        fontSize: 12,
        fontFamily: mono,
        color: colors.mutedForeground,
      },
      contentTextStyle: {
        fontFamily: mono,
        fontSize: 14,
        color: colors.foreground,
      },
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: 10,
      marginVertical: 8,
    },
    thematicBreak: {
      marginVertical: 12,
      height: 1,
      backgroundColor: colors.border,
    },
    container: { gap: 4 },
  };
}
