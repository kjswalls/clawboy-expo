/**
 * AchievementsOptInStep — shown after onboarding success step.
 *
 * If the user has already opted in (enabledAt !== null), immediately calls
 * onComplete without rendering anything visible.
 *
 * Privacy promise rendered verbatim per spec:
 * "We never see your chats, never store history, never send badge data."
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react-native';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

interface Props {
  colors: ThemeColors;
  /** Whether badges are currently enabled (enabledAt !== null). */
  isEnabled: boolean;
  /** Called when the user completes this step (enable or skip). */
  onComplete: () => void;
  onEnable: () => void;
}

const BADGE_PREVIEWS = ['🏅', '🔥', '🌙', '🐉', '⚡'];

export function AchievementsOptInStep({
  colors,
  isEnabled,
  onComplete,
  onEnable,
}: Props): React.JSX.Element | null {
  const { t } = useTranslation();

  // If already opted in, skip immediately.
  useEffect(() => {
    if (isEnabled) {
      onComplete();
    }
  }, [isEnabled, onComplete]);

  if (isEnabled) return null;

  const handleEnable = (): void => {
    onEnable();
    onComplete();
  };

  return (
    <Animated.View entering={FadeInUp.duration(350)} style={styles.wrap}>
      {/* Trophy icon + badge previews */}
      <View style={styles.iconRow}>
        <View style={[styles.trophyWrap, { backgroundColor: `${colors.primary}22` }]}>
          <Trophy size={32} color={colors.primary} />
        </View>
      </View>

      <View style={styles.badgePreviewRow}>
        {BADGE_PREVIEWS.map((emoji, i) => (
          <View
            key={i}
            style={[styles.badgePip, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={styles.badgePipEmoji}>{emoji}</Text>
          </View>
        ))}
        <Text style={[styles.badgePipMore, { color: colors.mutedForeground }]}>+29</Text>
      </View>

      <Text style={[styles.h1, { color: colors.foreground }]}>
        {t('badges.optIn.heading')}
      </Text>

      <Text style={[styles.p, { color: colors.mutedForeground }]}>
        {t('badges.optIn.body')}
      </Text>

      <View style={[styles.privacyCard, { backgroundColor: `${colors.primary}0A`, borderColor: `${colors.primary}22` }]}>
        <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
          {t('badges.optIn.privacy')}
        </Text>
      </View>

      <Pressable
        onPress={handleEnable}
        style={({ pressed }) => [
          styles.enableBtn,
          {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('badges.enable')}
      >
        <Trophy size={12} color={colors.primary} />
        <Text style={[styles.enableLabel, { color: colors.foreground }]}>
          {t('badges.enable')}
        </Text>
      </Pressable>

      <Pressable
        onPress={onComplete}
        style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={t('badges.skip')}
      >
        <Text style={[styles.skipLabel, { color: colors.mutedForeground }]}>
          {t('badges.skip')}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  iconRow: {
    marginBottom: Spacing.sm,
  },
  trophyWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  badgePip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgePipEmoji: {
    fontSize: 18,
  },
  badgePipMore: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginLeft: 2,
  },
  h1: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  p: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  privacyCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: '100%',
  },
  privacyText: {
    fontSize: FontSize.xs,
    lineHeight: 18,
    textAlign: 'left',
  },
  enableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.sm,
  },
  enableLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  skipBtn: {
    paddingVertical: Spacing.sm,
  },
  skipLabel: {
    fontSize: FontSize.sm,
  },
});
