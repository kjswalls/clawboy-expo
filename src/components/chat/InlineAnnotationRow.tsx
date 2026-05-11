/**
 * InlineAnnotationRow — compact annotation card rendered inline beneath a
 * message section when the bubble is in annotate mode.
 *
 * Block anchors (whole-section quotes) hide the duplicate quote by default;
 * a small "Show quote" toggle reveals it on demand. Range anchors always show
 * their quote (it's a meaningful sub-selection, not visible elsewhere).
 *
 * Updates are written directly to AnnotationContext on each keystroke.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAnnotationLayoutMaybe } from './AnnotationLayoutContext';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { ChevronRight, ChevronDown, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import type { Annotation } from '@/lib/annotations';

const QUOTE_PREVIEW_LINES = 5;

interface InlineAnnotationRowProps {
  annotation: Annotation;
  autoFocus?: boolean;
  /** When true, briefly flashes the card to draw attention (pill cycle). */
  highlighted?: boolean;
  onUpdateComment: (id: string, comment: string) => void;
  onRemove: (id: string) => void;
  /** Called when the comment input gains focus; used to scroll context into view. */
  onCommentFocus?: (id: string) => void;
  colors: ThemeColors;
}

export function InlineAnnotationRow({
  annotation,
  autoFocus = false,
  highlighted = false,
  onUpdateComment,
  onRemove,
  onCommentFocus,
  colors,
}: InlineAnnotationRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const isBlock = annotation.anchor.kind === 'block';

  // Block annotations: quote hidden by default (it's shown above in SectionMarkdown).
  // Range annotations: quote visible by default (it's a meaningful sub-selection).
  const [quoteVisible, setQuoteVisible] = useState(!isBlock);
  // For range annotations: whether the long quote is fully expanded.
  const [rangeExpanded, setRangeExpanded] = useState(false);

  const layout = useAnnotationLayoutMaybe();
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!layout) return;
    if (cardRef.current) {
      layout.register(annotation.id, cardRef.current);
    }
    return () => {
      layout.unregister(annotation.id);
    };
  }, [annotation.id, layout]);

  const flashOpacity = useSharedValue(0);

  useEffect(() => {
    if (!highlighted) return;
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 580 }),
    );
  }, [highlighted, flashOpacity]);

  const flashStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: BorderRadius.md,
    backgroundColor: `${colors.primary}33`,
    opacity: flashOpacity.value,
  }));

  // Range-only: truncation helpers
  const lines = annotation.quotedText.split('\n');
  const isLong = !isBlock && lines.length > QUOTE_PREVIEW_LINES;
  const displayLines =
    isBlock || rangeExpanded || !isLong ? lines : lines.slice(0, QUOTE_PREVIEW_LINES);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const handleToggleQuote = useCallback(() => setQuoteVisible((v) => !v), []);
  const handleToggleRangeExpand = useCallback(() => setRangeExpanded((v) => !v), []);
  const handleFocus = useCallback(() => onCommentFocus?.(annotation.id), [onCommentFocus, annotation.id]);

  return (
    <View
      ref={cardRef}
      style={[
        styles.card,
        {
          backgroundColor: `${colors.primary}0d`,
          borderColor: `${colors.primary}40`,
        },
      ]}
    >
      {/* Flash highlight overlay for pill-cycle feedback */}
      <Animated.View style={flashStyle} />

      {/* Quote section */}
      {quoteVisible ? (
        <View>
          {(isLong || isBlock) ? (
          <Pressable
            onPress={isLong ? handleToggleRangeExpand : handleToggleQuote}
            style={[styles.quoteBlock, { borderLeftColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel={
              isBlock
                ? t('chat.annotate.hideQuote')
                : rangeExpanded
                  ? t('chat.annotate.collapseSection')
                  : t('chat.annotate.expandSection')
            }
          >
            <Text
              style={[styles.quoteText, { color: colors.mutedForeground }]}
              numberOfLines={isLong && !rangeExpanded ? QUOTE_PREVIEW_LINES : undefined}
            >
              {displayLines.join('\n')}
            </Text>
          </Pressable>
          ) : (
          <View style={[styles.quoteBlock, { borderLeftColor: colors.primary }]}>
            <Text
              style={[styles.quoteText, { color: colors.mutedForeground }]}
            >
              {displayLines.join('\n')}
            </Text>
          </View>
          )}

          {/* Toggle label below quote */}
          {isBlock ? (
            <Pressable onPress={handleToggleQuote} style={styles.quoteToggleRow} hitSlop={8}>
              <ChevronDown size={11} color={colors.mutedForeground} />
              <Text style={[styles.quoteToggleText, { color: colors.mutedForeground }]}>
                {t('chat.annotate.hideQuote')}
              </Text>
            </Pressable>
          ) : isLong ? (
            <Pressable onPress={handleToggleRangeExpand} style={styles.quoteToggleRow} hitSlop={8}>
              <Text style={[styles.quoteToggleText, { color: colors.primary }]}>
                {rangeExpanded
                  ? t('chat.annotate.collapseSection')
                  : t('chat.annotate.expandSection')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        /* Block annotation: collapsed state — tiny "Show quote" row */
        <Pressable onPress={handleToggleQuote} style={styles.showQuoteBtn} hitSlop={8}>
          <ChevronRight size={11} color={colors.mutedForeground} />
          <Text style={[styles.showQuoteText, { color: colors.mutedForeground }]}>
            {t('chat.annotate.showQuote')}
          </Text>
        </Pressable>
      )}

      {/* Editable comment */}
      <TextInput
        ref={inputRef}
        style={[
          styles.commentInput,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
        value={annotation.comment}
        onChangeText={(text) => onUpdateComment(annotation.id, text)}
        onFocus={handleFocus}
        placeholder={t('chat.annotate.commentPlaceholder')}
        placeholderTextColor={colors.mutedForeground}
        multiline
        autoCorrect
        textAlignVertical="top"
      />

      {/* Remove */}
      <Pressable
        onPress={() => onRemove(annotation.id)}
        hitSlop={8}
        style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('chat.annotate.deleteAnnotation')}
        accessibilityRole="button"
      >
        <Trash2 size={12} color={colors.destructive} />
        <Text style={[styles.removeBtnText, { color: colors.destructive }]}>
          {t('chat.annotate.deleteAnnotation')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    overflow: 'hidden',
  },
  quoteBlock: {
    borderLeftWidth: 2,
    paddingLeft: Spacing.sm,
    gap: 2,
  },
  quoteText: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  quoteToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: Spacing.sm,
    marginTop: 2,
  },
  quoteToggleText: {
    fontSize: 10,
    fontWeight: FontWeight.medium,
  },
  showQuoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  showQuoteText: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
  },
  commentInput: {
    fontSize: FontSize.sm,
    lineHeight: 18,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minHeight: 52,
    maxHeight: 120,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  removeBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
