import { Platform } from 'react-native';
import type { StyleSheet } from 'react-native';

import type { ThemeColors } from '@/types';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export type MarkdownStyles = StyleSheet.NamedStyles<Record<string, object>>;

/** Dark markdown styles for `@ronradtke/react-native-markdown-display`. */
export function createMarkdownStyles(colors: ThemeColors): MarkdownStyles {
  return {
    body: {
      gap: 4,
    },
    paragraph: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.foreground,
      marginTop: 0,
      marginBottom: 4,
    },
    heading1: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.foreground,
      marginTop: 12,
      marginBottom: 4,
    },
    heading2: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.foreground,
      marginTop: 12,
      marginBottom: 4,
    },
    heading3: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 4,
    },
    heading4: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 4,
    },
    heading5: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 4,
    },
    heading6: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 4,
    },
    strong: {
      fontWeight: '700',
      color: colors.foreground,
    },
    em: {
      fontStyle: 'italic',
      color: colors.foreground,
    },
    link: {
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    code_inline: {
      fontFamily: mono,
      fontSize: 13,
      backgroundColor: colors.secondary,
      color: colors.foreground,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    fence: {
      marginVertical: 4,
    },
    code_block: {
      fontFamily: mono,
      fontSize: 13,
      color: colors.foreground,
      backgroundColor: colors.background,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bullet_list: {
      marginBottom: 4,
    },
    ordered_list: {
      marginBottom: 4,
    },
    list_item: {
      flexDirection: 'row',
      marginBottom: 2,
    },
    bullet_list_icon: {
      color: colors.foreground,
      marginRight: 6,
      marginTop: 2,
    },
    ordered_list_icon: {
      color: colors.foreground,
      marginRight: 6,
      marginTop: 2,
      fontSize: 15,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: 10,
      marginVertical: 8,
      backgroundColor: 'transparent',
    },
    hr: {
      marginVertical: 12,
      height: 1,
      backgroundColor: colors.border,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      marginVertical: 8,
    },
    thead: {},
    tbody: {},
    th: {
      padding: 8,
      backgroundColor: colors.secondary,
    },
    td: {
      padding: 8,
    },
    tr: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
    },
    text: {
      color: colors.foreground,
    },
  };
}
