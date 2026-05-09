import MarkdownIt from 'markdown-it';
import { Platform } from 'react-native';
import type { StyleSheet } from 'react-native';

import { FontSize } from '@/constants/theme';
import type { ThemeColors } from '@/types';

/**
 * Markdown-it for About-screen changelog bullets (inline emphasis, code spans).
 * No HTML, no linkify — avoids turning incidental prose into links.
 */
export const changelogMarkdownIt = MarkdownIt({
  html: false,
  typographer: false,
  linkify: false,
  breaks: false,
});

/**
 * Shared markdown-it instance for chat messages.
 * Module-level singleton keeps the markdownit prop reference stable so
 * the library's internal useMemo on AstRenderer doesn't re-run on every render.
 *
 * linkify: true enables bare-URL auto-detection (https://… → clickable link).
 * fuzzyLink/fuzzyEmail are disabled so bare TLD-shaped filenames like
 * "memory.md" or "script.sh" are NOT auto-promoted to http:// URLs.
 * Explicit-scheme URLs (https://example.com) and www. hosts still auto-link.
 */
export const chatMarkdownIt = MarkdownIt({
  typographer: true,
  linkify: true,
  breaks: false,
});
chatMarkdownIt.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export type MarkdownStyles = StyleSheet.NamedStyles<Record<string, object>>;

/**
 * Inline markdown for changelog list rows — tight paragraph, matches bullet line-height.
 */
export function createChangelogItemMarkdownStyles(
  colors: ThemeColors,
  fontSize: number = FontSize.sm
): MarkdownStyles {
  const lineHeight = Math.round((fontSize * 20) / 14);
  return {
    body: { margin: 0, padding: 0 },
    paragraph: {
      marginTop: 0,
      marginBottom: 0,
      fontSize,
      lineHeight,
      color: colors.foreground,
    },
    strong: { fontWeight: '700', color: colors.foreground },
    em: { fontStyle: 'italic', color: colors.foreground },
    link: {
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    code_inline: {
      fontFamily: mono,
      fontSize: fontSize - 1,
      color: colors.foreground,
      backgroundColor: colors.secondary,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    text: { color: colors.foreground },
    fence: { display: 'none' as const },
    code_block: { display: 'none' as const },
    blockquote: { display: 'none' as const },
  };
}

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

/** Chat markdown styles.
 *
 * Pass an optional `font` scale object (from `useTokens().fs` or `Tokens[density].font`)
 * to make the styles respond to UI density. Defaults to the Comfortable baseline.
 */
export function createMarkdownStyles(
  colors: ThemeColors,
  font: { xs: number; sm: number; base: number; md: number; lg: number; xl: number; '2xl': number } = {
    xs: 13, sm: 15, base: 16, md: 17, lg: 19, xl: 21, '2xl': 25,
  },
): MarkdownStyles {
  const body = font.base;
  const lineH = Math.round(body * 1.5);
  const codeSz = body - 2;
  return {
    body: {
      gap: 4,
    },
    // NOTE: Only Text-compatible props here. The paragraph rule in MessageBubble
    // renders this as <Text> (not <View>) so non-text layout props (flex, width,
    // alignItems, etc.) are silently ignored by the native text engine.
    paragraph: {
      fontSize: body,
      lineHeight: lineH,
      color: colors.foreground,
      marginTop: 0,
      marginBottom: 4,
    },
    heading1: {
      fontSize: font.xl,
      fontWeight: '700',
      color: colors.foreground,
      marginTop: 12,
      marginBottom: 4,
    },
    heading2: {
      fontSize: font.lg,
      fontWeight: '700',
      color: colors.foreground,
      marginTop: 12,
      marginBottom: 4,
    },
    heading3: {
      fontSize: font.md,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 4,
    },
    heading4: {
      fontSize: body,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 4,
    },
    heading5: {
      fontSize: body,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 4,
    },
    heading6: {
      fontSize: body,
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
      fontSize: codeSz,
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
      fontSize: codeSz,
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
      fontSize: body,
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
