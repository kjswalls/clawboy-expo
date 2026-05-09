/**
 * BadgePip — compact circular badge pip for account card pip rows.
 * Used in both AccountSection (main Settings) and AccountSettingsScreen.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { getBadgeTierColor } from '@/badges/tierColors';
import { ProgressBar } from '@/components/badges/ProgressBar';
import type { BadgeDisplayRecord } from '@/badges/hooks';

export type { BadgeDisplayRecord };

export interface BadgePipProps {
  badge: BadgeDisplayRecord;
  onPress: () => void;
}

export function BadgePip({ badge, onPress }: BadgePipProps): React.JSX.Element {
  const { colors } = useTheme();

  const isEarned = badge.unlock !== null;
  const emojiOpacity = isEarned ? 1 : 0.35;

  const tierColor = isEarned
    ? getBadgeTierColor(badge.unlock?.tier, colors.primary)
    : colors.muted;

  const pipBg = isEarned ? `${tierColor}22` : `${colors.muted}44`;
  const pipBorder = isEarned ? `${tierColor}55` : colors.border;

  const showProgress =
    badge.kind === 'track' &&
    badge.currentValue !== null &&
    badge.nextThreshold !== null;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [pipStyles.wrap, pressed && { opacity: 0.7 }]}
      accessibilityLabel={`${badge.name} badge`}
      accessibilityRole="button"
    >
      <View style={[pipStyles.pip, { backgroundColor: pipBg, borderColor: pipBorder }]}>
        <Text style={[pipStyles.emoji, { opacity: emojiOpacity }]}>{badge.icon}</Text>
      </View>
      {showProgress && (
        <View style={pipStyles.progressWrap}>
          <ProgressBar
            value={badge.currentValue!}
            max={badge.nextThreshold!}
            color={isEarned ? tierColor : colors.mutedForeground}
            height={3}
          />
        </View>
      )}
    </Pressable>
  );
}

export const pipStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 3,
  },
  pip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emoji: {
    fontSize: 15,
  },
  progressWrap: {
    width: 28,
  },
});
