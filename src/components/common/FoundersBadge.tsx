/**
 * FoundersBadge — small pill shown next to the user's name when they own a
 * Founders Edition tier. Renders nothing for 'free'.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontWeight } from '@/constants/theme';
import type { FounderTier } from '@/lib/purchases/types';

const TIER_META: Record<
  Exclude<FounderTier, 'free'>,
  { label: string; color: string; bg: string; border: string }
> = {
  founder_bronze: {
    label: 'Bronze Founder',
    color: '#CD7F32',
    bg: '#CD7F3218',
    border: '#CD7F3240',
  },
  founder_silver: {
    label: 'Silver Founder',
    color: '#A8A9AD',
    bg: '#A8A9AD18',
    border: '#A8A9AD40',
  },
  founder_gold: {
    label: 'Gold Founder',
    color: '#FFD700',
    bg: '#FFD70018',
    border: '#FFD70040',
  },
};

interface FoundersBadgeProps {
  tier: FounderTier | string;
}

export function FoundersBadge({ tier }: FoundersBadgeProps): React.JSX.Element | null {
  if (!tier || tier === 'free') return null;

  const meta = TIER_META[tier as Exclude<FounderTier, 'free'>];
  if (!meta) return null;

  return (
    <View style={[styles.pill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
      <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
});
