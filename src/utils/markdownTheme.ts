import MarkdownIt from 'markdown-it';
import { Platform } from 'react-native';
import type { StyleSheet } from 'react-native';

import type { ThemeColors } from '@/types';

/**
 * Shared markdown-it instance for chat messages.
 * Module-level singleton keeps the markdownit prop reference stable so
 * the library's internal useMemo on AstRenderer doesn't re-run on every render.
 *
 * linkify: true enables bare-URL auto-detection (https://… → clickable link).
 */
export const chatMarkdownIt = MarkdownIt({
  typographer: true,
  linkify: true,
  breaks: false,
});

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export type MarkdownStyles = StyleSheet.NamedStyles<Record<string, object>>;

/**
 * Compact inline-markdown styles for notification/error banners.
 * Keeps tight line-height and no paragraph margins so it fits in a dense layout.
 */
export function createBannerMarkdownStyles(textColor: string, fontSize = 12): MarkdownStyles {
  return {
    body: { margin: 0, padding: 0 },
    paragraph: {
      fontSize,
      lineHeight: fontSize * 1.45,
      color: textColor,
      marginTop: 0,
      marginBottom: 0,
    },
    strong: { fontWeight: '700', color: textColor },
    em: { fontStyle: 'italic', color: textColor },
    code_inline: {
      fontFamily: mono,
      fontSize: fontSize - 1,
      color: textColor,
      backgroundColor: 'transparent',
    },
    text: { color: textColor },
    // Suppress block-level elements that don't belong in a banner
    fence: { display: 'none' as const },
    code_block: { display: 'none' as const },
    blockquote: { display: 'none' as const },
    bullet_list: { marginBottom: 0 },
    ordered_list: { marginBottom: 0 },
    list_item: { flexDirection: 'row' as const, marginBottom: 2 },
  };
}

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
      textDecorationColor: colors.primary,
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
