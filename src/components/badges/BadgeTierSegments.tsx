/**
 * BadgeTierSegments — horizontal tier ladder for track badges.
 *
 * Each segment maps to one tier threshold. Visual states:
 *   reached        — full tier color (bronze→diamond)
 *   next-up        — tinted bg + colored border, slight dim
 *   free-locked    — muted bg, extra-dim, lock icon
 *   future         — muted bg, dim
 *
 * Returns null for non-track badges (no tiers defined).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { BADGE_BY_ID } from '@/badges/definitions';
import { BADGE_TIER_COLORS } from '@/badges/tierColors';
import { useEntitlements } from '@/badges/hooks';
import type { BadgeId } from '@/badges/types';

interface Props {
  badgeId: BadgeId;
  /** Highest unlocked tier index (0-based). -1 if none reached. */
  reachedTierIdx: number;
  /** sm = compact grid card; md = detail modal */
  size?: 'sm' | 'md';
}

export function BadgeTierSegments({ badgeId, reachedTierIdx, size = 'sm' }: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  const { tier: entitlementTier } = useEntitlements();

  const def = BADGE_BY_ID[badgeId];
  if (!def?.tiers || def.tiers.length === 0) return null;

  const { tiers, freeTierMax } = def;
  const isSm = size === 'sm';
  const segH = isSm ? 6 : 8;
  const segMinW = isSm ? 12 : 16;

  const segments = tiers.map((threshold, i) => {
    const tierColor = BADGE_TIER_COLORS[Math.min(i, BADGE_TIER_COLORS.length - 1)] ?? colors.primary;
    const isReached = i <= reachedTierIdx;
    const isNextUp = i === reachedTierIdx + 1;
    const isFreeLocked =
      entitlementTier === 'free' &&
      freeTierMax !== undefined &&
      i > freeTierMax;

    let bg: string;
    let borderColor: string;
    let opacity: number;

    if (isReached) {
      bg = tierColor;
      borderColor = tierColor;
      opacity = 1;
    } else if (isFreeLocked) {
      bg = colors.muted;
      borderColor = colors.border;
      opacity = 0.3;
    } else if (isNextUp) {
      bg = `${tierColor}22`;
      borderColor = `${tierColor}55`;
      opacity = 0.75;
    } else {
      bg = colors.muted;
      borderColor = colors.border;
      opacity = 0.4;
    }

    return (
      <View
        key={i}
        style={[
          styles.segment,
          {
            flex: 1,
            minWidth: segMinW,
            height: segH,
            borderRadius: segH / 2,
            backgroundColor: bg,
            borderColor,
            opacity,
          },
        ]}
        accessibilityLabel={`Tier ${i + 1}${isReached ? ' reached' : ''}`}
      >
        {isFreeLocked && !isSm && (
          <Lock size={8} color={colors.mutedForeground} style={styles.lockIcon} />
        )}
      </View>
    );
  });

  // In md mode, show a compact label below the bar for the current/next tier
  const tierLabel = (() => {
    if (isSm) return null;
    if (reachedTierIdx >= 0) {
      const nextIdx = reachedTierIdx + 1;
      const hasNext = nextIdx < tiers.length;
      const label = `Tier ${reachedTierIdx + 1} of ${tiers.length}`;
      const nextStr = hasNext ? ` · next: ${(tiers[nextIdx] ?? 0).toLocaleString()}` : ' · max reached';
      return label + nextStr;
    }
    const first = tiers[0];
    return first !== undefined ? `First tier: ${first.toLocaleString()}` : null;
  })();

  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { gap: isSm ? 3 : 4 }]}>
        {segments}
      </View>
      {tierLabel ? (
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{tierLabel}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'stretch',
    gap: 3,
  },
  bar: {
    flexDirection: 'row',
    width: '100%',
  },
  segment: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lockIcon: {
    // lucide icon renders inline — this silences the TS style warning
  },
  label: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 1,
  },
});
