/**
 * BadgeCard — single badge tile for the grid.
 *
 * Visual states:
 *   earned          — full emoji + name
 *   in_progress     — emoji (dim) + progress bar
 *   pro_locked      — ❓ + name only, tap → upgrade CTA (Pro tier)
 *   founders_locked — 🔒 + name, tap → "Founders Edition exclusive"
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pin } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { BadgeDisplayRecord } from '@/badges/hooks';
import { ProgressBar } from './ProgressBar';
import { BadgeTierSegments } from './BadgeTierSegments';

interface Props {
  badge: BadgeDisplayRecord;
  isPinned?: boolean;
  onPress?: (badge: BadgeDisplayRecord) => void;
}

export const BadgeCard = React.memo(function BadgeCard({ badge, isPinned = false, onPress }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const isLocked = badge.visibleState === 'pro_locked' || badge.visibleState === 'founders_locked';
  const isFoundersLocked = badge.visibleState === 'founders_locked';

  const displayEmoji = isLocked
    ? (isFoundersLocked ? '🔒' : '❓')
    : badge.icon;

  const opacity = badge.visibleState === 'earned' ? 1 : 0.6;

  const showProgress =
    badge.visibleState === 'in_progress' &&
    badge.nextThreshold !== null &&
    badge.currentValue !== null;

  return (
    <Pressable
      onPress={() => onPress?.(badge)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: badge.visibleState === 'earned' ? `${colors.primary}44` : colors.border,
          opacity: pressed ? 0.8 : opacity,
        },
      ]}
      accessibilityLabel={t('badges.a11y.badgeCard', { name: badge.name })}
      accessibilityHint={isPinned ? t('badges.a11y.pinnedHint') : undefined}
      accessibilityRole="button"
    >
      {/* Emoji */}
      <Text style={styles.emoji}>{displayEmoji}</Text>

      {/* Name */}
      <Text
        numberOfLines={2}
        style={[
          styles.name,
          {
            color: isLocked ? colors.mutedForeground : colors.foreground,
          },
        ]}
      >
        {badge.name}
      </Text>

      {/* Tier segments for track badges */}
      {badge.kind === 'track' && (
        <BadgeTierSegments
          badgeId={badge.id}
          reachedTierIdx={badge.unlock?.tier ?? -1}
          size="sm"
        />
      )}

      {/* Progress bar */}
      {showProgress && (
        <ProgressBar
          value={badge.currentValue!}
          max={badge.nextThreshold!}
          color={colors.primary}
        />
      )}

      {/* Unseen dot — top-left */}
      {badge.unlock && !badge.unlock.seen && (
        <View style={[styles.unseenDot, { backgroundColor: colors.primary }]} />
      )}

      {/* Pinned chip — top-right */}
      {isPinned && (
        <View style={[styles.pinChip, { backgroundColor: `${colors.primary}22` }]}>
          <Pin size={10} color={colors.primary} />
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
    height: 130,
    justifyContent: 'center',
    position: 'relative',
  },
  emoji: {
    fontSize: 32,
  },
  name: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 15,
  },
  unseenDot: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pinChip: {
    position: 'absolute',
    top: 5,
    right: 5,
    borderRadius: 999,
    padding: 3,
  },
});
