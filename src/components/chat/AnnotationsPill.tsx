/**
 * AnnotationsPill — floating 3-zone pill shown above the InputBar when there
 * are pending annotations.
 *
 * - Tap label area  → cycle to next annotated message (wraps)
 * - Tap eye icon    → open composed-reply preview
 * - Tap × icon      → clear all annotations
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
} from 'react-native-reanimated';
import { Eye, MessageSquarePlus, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';

interface AnnotationsPillProps {
  count: number;
  /** Cycles to the next annotated message and enters annotate mode on it. */
  onCyclePress: () => void;
  /** Opens the composed-reply preview modal. */
  onPreviewPress: () => void;
  /** Clears all pending annotations. */
  onClearPress: () => void;
}

export function AnnotationsPill({
  count,
  onCyclePress,
  onPreviewPress,
  onClearPress,
}: AnnotationsPillProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (count === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(140)}
      style={styles.wrap}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.secondary,
            borderColor: colors.primary,
          },
        ]}
      >
        {/* ── Left zone: cycle ───────────────────────────────── */}
        <Pressable
          onPress={onCyclePress}
          style={({ pressed }) => [styles.cycleZone, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t('chat.annotate.pillCycleLabel', { count })}
          hitSlop={4}
        >
          <MessageSquarePlus size={14} color={colors.primary} />
          <Text style={[styles.label, { color: colors.foreground }]}>
            {t('chat.annotate.pillLabel', { count })}
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
              {count}
            </Text>
          </View>
        </Pressable>

        {/* ── Divider ────────────────────────────────────────── */}
        <View style={[styles.divider, { backgroundColor: colors.primary + '40' }]} />

        {/* ── Right zone: preview + clear ────────────────────── */}
        <View style={styles.actions}>
          <Pressable
            onPress={onPreviewPress}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.annotate.pillPreviewLabel')}
            hitSlop={6}
          >
            <Eye size={13} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={onClearPress}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.annotate.pillClearLabel')}
            hitSlop={6}
          >
            <X size={13} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingBottom: Spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    overflow: 'hidden',
  },
  cycleZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
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
  divider: {
    width: 1,
    height: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  actionBtn: {
    padding: 5,
    borderRadius: BorderRadius.sm,
  },
});
