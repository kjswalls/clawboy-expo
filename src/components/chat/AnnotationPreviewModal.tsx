/**
 * AnnotationPreviewModal — shows the fully-composed annotated reply before
 * sending. Each annotation is rendered as a primary-bar blockquote card so
 * the quoted reference and comment are visually grouped and readable.
 *
 * What gets sent to the gateway is still produced by composeAnnotatedReply()
 * unchanged — this view is presentation only.
 */

import Markdown from '@ronradtke/react-native-markdown-display';
import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTokens } from '@/hooks/useTokens';
import { buildReferenceHeader, sortAnnotationsByDocumentOrder } from '@/lib/annotations';
import type { Annotation, ComposeOptions } from '@/lib/annotations';
import { createMarkdownStyles } from '@/utils/markdownTheme';
import { chatMarkdownIt } from '@/utils/markdownTheme';

interface AnnotationPreviewModalProps {
  visible: boolean;
  /** Current text from the input bar (prelude before blockquotes). */
  prelude: string;
  annotations: Annotation[];
  /**
   * Map of messageId → original assistant content. Passed to
   * buildReferenceHeader so preview headings match what the AI will see.
   */
  messagesById: ComposeOptions['messagesById'];
  onClose: () => void;
  /** Called when the user taps Send from within the preview. */
  onSend: () => void;
}

interface RefCard {
  annotation: Annotation;
  header: string | null;
}

export function AnnotationPreviewModal({
  visible,
  prelude,
  annotations,
  messagesById,
  onClose,
  onSend,
}: AnnotationPreviewModalProps): React.JSX.Element {
  const { colors } = useTheme();
  const { fs } = useTokens();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const markdownStyles = useMemo(
    () => createMarkdownStyles(colors, fs),
    [colors, fs],
  );

  const refCards = useMemo<RefCard[]>(() => {
    const ordered = sortAnnotationsByDocumentOrder(annotations);
    return ordered
      .filter((a) => a.quotedText.trim())
      .map((a) => ({
        annotation: a,
        header: buildReferenceHeader(a, messagesById),
      }));
  }, [annotations, messagesById]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      accessibilityViewIsModal={true}
    >
      <View style={styles.overlay}>
        {/* ── Sheet container ─────────────────────────────────────── */}
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t('chat.annotate.previewTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
            >
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Composed reply preview */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Optional free-text prelude */}
            {prelude.trim() ? (
              <Markdown style={markdownStyles} markdownit={chatMarkdownIt}>
                {prelude.trim()}
              </Markdown>
            ) : null}

            {/* Empty state when no annotations and no prelude */}
            {!prelude.trim() && refCards.length === 0 ? (
              <Text style={[styles.emptyState, { color: colors.mutedForeground }]}>
                {t('chat.annotate.previewEmpty')}
              </Text>
            ) : null}

            {/* One blockquote card per annotation */}
            {refCards.map(({ annotation, header }) => (
              <View
                key={annotation.id}
                style={[
                  styles.refCard,
                  {
                    borderLeftColor: colors.primary,
                    backgroundColor: `${colors.primary}0d`,
                  },
                ]}
              >
                {/* Reference header — "Re: …" */}
                {header ? (
                  <Text style={[styles.refHeader, { color: colors.mutedForeground }]}>
                    {header}
                  </Text>
                ) : (
                  /* Fallback: show raw snippet when no heading/map available */
                  <Text
                    style={[styles.refHeader, { color: colors.mutedForeground }]}
                    numberOfLines={3}
                  >
                    {annotation.quotedText.replace(/\s+/g, ' ').trim()}
                  </Text>
                )}

                {/* User comment */}
                {annotation.comment.trim() ? (
                  <Text style={[styles.refComment, { color: colors.foreground }]}>
                    {annotation.comment.trim()}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>

          {/* Footer: Send */}
          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
            <Pressable
              onPress={onSend}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('chat.annotate.previewSend')}
            >
              <Send size={12} color={colors.primary} />
              <Text style={[styles.sendBtnText, { color: colors.foreground }]}>
                {t('chat.annotate.previewSend')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  refCard: {
    borderLeftWidth: 3,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  refHeader: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  refComment: {
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  emptyState: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sendBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});
