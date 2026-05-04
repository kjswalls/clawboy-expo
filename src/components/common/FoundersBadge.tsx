/**
 * FoundersBadge — small pill shown next to the user's name for paid tiers.
 * Renders nothing for 'free'.
 *
 *   founder → warm gold pill ("Founder")
 *   pro     → electric blue pill ("Pro")
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontWeight } from '@/constants/theme';
import type { EntitlementTier } from '@/lib/supabase/types';

const TIER_META: Record<
  Exclude<EntitlementTier, 'free'>,
  { label: string; color: string; bg: string; border: string }
> = {
  founder: {
    label: 'Founder',
    color: '#FFB347',
    bg: '#FFB34718',
    border: '#FFB34740',
  },
  pro: {
    label: 'Pro',
    color: '#60A5FA',
    bg: '#60A5FA18',
    border: '#60A5FA40',
  },
};

interface FoundersBadgeProps {
  tier: EntitlementTier | string;
}

export function FoundersBadge({ tier }: FoundersBadgeProps): React.JSX.Element | null {
  if (!tier || tier === 'free') return null;

  const meta = TIER_META[tier as Exclude<EntitlementTier, 'free'>];
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
