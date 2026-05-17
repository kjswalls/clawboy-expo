import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Eye, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';

interface InputBarAnnotationStripProps {
  annotationCount: number;
  onCyclePrev: () => void;
  onCycleNext: () => void;
  onPreview: () => void;
  onClear: () => void;
}

export function InputBarAnnotationStrip({
  annotationCount,
  onCyclePrev,
  onCycleNext,
  onPreview,
  onClear,
}: InputBarAnnotationStripProps): React.JSX.Element | null {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  if (annotationCount === 0) return null;

  const chevronsDisabled = annotationCount <= 1;

  return (
    <Animated.View
      entering={FadeInDown.duration(150)}
      exiting={FadeOutDown.duration(150)}
      style={[styles.container, styles.countRow]}
    >
      <Pressable
        onPress={chevronsDisabled ? undefined : onCyclePrev}
        style={({ pressed }) => [styles.chevronBtn, pressed && !chevronsDisabled && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t('chat.annotate.pillCyclePrevLabel', { count: annotationCount })}
        hitSlop={8}
      >
        <ChevronLeft size={14} color={chevronsDisabled ? colors.mutedForeground : colors.primary} />
      </Pressable>

      <Text style={[styles.label, { color: colors.foreground }]}>
        {t('chat.annotate.pillLabel', { count: annotationCount })}
      </Text>
      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
        <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
          {annotationCount}
        </Text>
      </View>

      <Pressable
        onPress={chevronsDisabled ? undefined : onCycleNext}
        style={({ pressed }) => [styles.chevronBtn, pressed && !chevronsDisabled && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t('chat.annotate.pillCycleNextLabel', { count: annotationCount })}
        hitSlop={8}
      >
        <ChevronRight size={14} color={chevronsDisabled ? colors.mutedForeground : colors.primary} />
      </Pressable>

      <Pressable
        onPress={onPreview}
        style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t('chat.annotate.pillPreviewLabel')}
        hitSlop={6}
      >
        <Eye size={13} color={colors.primary} />
      </Pressable>
      <Pressable
        onPress={onClear}
        style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t('chat.annotate.pillClearLabel')}
        hitSlop={6}
      >
        <X size={13} color={colors.mutedForeground} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chevronBtn: {
    padding: 2,
    borderRadius: BorderRadius.sm,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    lineHeight: 14,
  },
  actionBtn: {
    padding: 5,
    borderRadius: BorderRadius.sm,
  },
});
