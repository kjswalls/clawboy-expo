/**
 * InlineAnnotationRow — compact annotation card rendered inline beneath a
 * message section when the bubble is in annotate mode.
 *
 * Shows the quoted text (expandable if long) and an editable comment field.
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
import { Trash2 } from 'lucide-react-native';
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
  colors: ThemeColors;
}

export function InlineAnnotationRow({
  annotation,
  autoFocus = false,
  highlighted = false,
  onUpdateComment,
  onRemove,
  colors,
}: InlineAnnotationRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const [expanded, setExpanded] = useState(false);
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
    // Pulse: fade in accent overlay then fade back out
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

  const lines = annotation.quotedText.split('\n');
  const isLong = lines.length > QUOTE_PREVIEW_LINES;
  const displayLines = expanded || !isLong ? lines : lines.slice(0, QUOTE_PREVIEW_LINES);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const handleToggleExpand = useCallback(() => setExpanded((v) => !v), []);

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

      {/* Quoted text */}
      <Pressable
        onPress={isLong ? handleToggleExpand : undefined}
        style={[styles.quoteBlock, { borderLeftColor: colors.primary }]}
        accessibilityRole={isLong ? 'button' : 'text'}
        accessibilityLabel={
          isLong
            ? expanded
              ? t('chat.annotate.collapseSection')
              : t('chat.annotate.expandSection')
            : undefined
        }
      >
        <Text
          style={[styles.quoteText, { color: colors.mutedForeground }]}
          numberOfLines={expanded ? undefined : (isLong ? QUOTE_PREVIEW_LINES : undefined)}
        >
          {displayLines.join('\n')}
        </Text>
        {isLong ? (
          <Text style={[styles.expandToggle, { color: colors.primary }]}>
            {expanded ? t('chat.annotate.collapseSection') : t('chat.annotate.expandSection')}
          </Text>
        ) : null}
      </Pressable>

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
        <Trash2 size={12} color={colors.destructive ?? '#DC2626'} />
        <Text style={[styles.removeBtnText, { color: colors.destructive ?? '#DC2626' }]}>
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
  expandToggle: {
    fontSize: 10,
    fontWeight: FontWeight.medium,
    marginTop: 2,
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
