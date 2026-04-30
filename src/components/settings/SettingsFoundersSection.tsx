/**
 * SettingsFoundersSection — Founders Edition tier cards + restore button.
 *
 * - Shows Bronze / Silver / Gold cards with perks, owned state, and price.
 * - Restore Purchases button at the bottom (required by App Review).
 * - Sign-in nudge (non-blocking) for cross-device sync.
 * - Works fully without Supabase login — RC is the source of truth.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CheckCircle, Lock, RotateCcw, Star } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAccountContext } from '@/contexts/AccountContext';
import { usePurchases } from '@/contexts/PurchasesContext';
import { FOUNDERS_TIERS } from '@/lib/purchases/products';
import type { FounderTier, FoundersTierMeta } from '@/lib/purchases/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tier colors
// ─────────────────────────────────────────────────────────────────────────────

const TIER_ACCENT: Record<string, string> = {
  founder_bronze: '#CD7F32',
  founder_silver: '#A8A9AD',
  founder_gold: '#FFD700',
};

function tierAccent(id: FounderTier | string): string {
  return TIER_ACCENT[id] ?? '#A855F7';
}

// ─────────────────────────────────────────────────────────────────────────────
// FoundersTierCard
// ─────────────────────────────────────────────────────────────────────────────

interface TierCardProps {
  meta: FoundersTierMeta;
  priceLabel: string;
  isOwned: boolean;
  isLoading: boolean;
  onPress: () => void;
}

function FoundersTierCard({ meta, priceLabel, isOwned, isLoading, onPress }: TierCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const accent = tierAccent(meta.id);
  const [busy, setBusy] = useState(false);

  const handlePress = async (): Promise<void> => {
    if (isOwned || busy) return;
    setBusy(true);
    try {
      await onPress();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={() => { void handlePress(); }}
      disabled={isOwned || busy || isLoading}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: isOwned ? accent : `${accent}44`,
          backgroundColor: isOwned ? `${accent}12` : colors.card,
          opacity: pressed && !isOwned ? 0.85 : 1,
        },
      ]}
      accessibilityLabel={`${meta.label} Founders Edition${isOwned ? ', owned' : `, ${priceLabel}`}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: isOwned }}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.tierIcon, { backgroundColor: `${accent}20` }]}>
          <Star size={14} color={accent} fill={isOwned ? accent : 'none'} />
        </View>
        <Text style={[styles.tierLabel, { color: colors.foreground }]}>{meta.label}</Text>
        {isOwned ? (
          <View style={[styles.ownedBadge, { backgroundColor: `${accent}20`, borderColor: `${accent}50` }]}>
            <CheckCircle size={11} color={accent} />
            <Text style={[styles.ownedText, { color: accent }]}>Owned</Text>
          </View>
        ) : (
          <Text style={[styles.price, { color: colors.foreground }]}>{priceLabel}</Text>
        )}
      </View>

      {/* Perks */}
      <View style={styles.perks}>
        {meta.perks.map((perk) => (
          <View key={perk} style={styles.perkRow}>
            <View style={[styles.perkDot, { backgroundColor: accent }]} />
            <Text style={[styles.perkText, { color: colors.mutedForeground }]}>{perk}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      {!isOwned && (
        <View style={[styles.ctaBtn, { backgroundColor: accent }]}>
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.ctaLabel}>Unlock {meta.label}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main section
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsFoundersSection(): React.JSX.Element {
  const { colors } = useTheme();
  const { status } = useAccountContext();
  const { tier, isLoading, offerings, purchaseFounders, restore } = usePurchases();
  const [restoring, setRestoring] = useState(false);

  /** Resolve display price for a Founders tier from RC offerings. */
  function priceFor(meta: FoundersTierMeta): string {
    if (!offerings) return meta.defaultPriceLabel;
    for (const offering of Object.values(offerings.all)) {
      for (const pkg of offering.availablePackages) {
        if (pkg.product.identifier === meta.productId) {
          return pkg.product.priceString;
        }
      }
    }
    return meta.defaultPriceLabel;
  }

  function isOwned(meta: FoundersTierMeta): boolean {
    const tierOrder: FounderTier[] = ['free', 'founder_bronze', 'founder_silver', 'founder_gold'];
    const userIdx = tierOrder.indexOf(tier as FounderTier);
    const metaIdx = tierOrder.indexOf(meta.id);
    return userIdx >= metaIdx && tier !== 'free';
  }

  const handlePurchase = async (targetTier: FounderTier): Promise<void> => {
    const result = await purchaseFounders(targetTier);
    if (result.status === 'error') {
      Alert.alert('Purchase Failed', result.message);
    }
    // cancelled → silent; success → tier state updates via RC listener
  };

  const handleRestore = async (): Promise<void> => {
    setRestoring(true);
    try {
      await restore();
      Alert.alert('Purchases Restored', 'Your Founders perks have been restored.');
    } catch {
      Alert.alert('Restore Failed', 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.container}>
      {/* Heading */}
      <View style={styles.heading}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Founders Edition</Text>
        <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
          Support development and unlock exclusive cosmetics. One-time purchase, no subscription.
        </Text>
      </View>

      {/* Tier cards */}
      {FOUNDERS_TIERS.map((meta) => (
        <FoundersTierCard
          key={meta.id}
          meta={meta}
          priceLabel={priceFor(meta)}
          isOwned={isOwned(meta)}
          isLoading={isLoading}
          onPress={() => handlePurchase(meta.id)}
        />
      ))}

      {/* Sign-in nudge — non-blocking */}
      {status === 'signed-out' && (
        <View style={[styles.nudge, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Lock size={13} color={colors.mutedForeground} />
          <Text style={[styles.nudgeText, { color: colors.mutedForeground }]}>
            Sign in to keep your Founders perks across devices. Purchase works without signing in.
          </Text>
        </View>
      )}

      {/* Restore Purchases — required by App Review */}
      <Pressable
        onPress={() => { void handleRestore(); }}
        disabled={restoring}
        style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.6 }]}
        accessibilityLabel="Restore Purchases"
        accessibilityRole="button"
      >
        {restoring
          ? <ActivityIndicator size="small" color={colors.mutedForeground} />
          : (
            <>
              <RotateCcw size={13} color={colors.mutedForeground} />
              <Text style={[styles.restoreLabel, { color: colors.mutedForeground }]}>Restore Purchases</Text>
            </>
          )}
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  heading: {
    gap: 4,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  sectionSub: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },

  // ── Tier card ──────────────────────────────────────────────────────────────
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tierIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  price: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  ownedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  ownedText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },
  perks: {
    gap: 5,
    paddingLeft: 4,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  perkDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  perkText: {
    fontSize: FontSize.xs,
    lineHeight: 18,
    flex: 1,
  },
  ctaBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
    minHeight: 36,
  },
  ctaLabel: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },

  // ── Nudge ──────────────────────────────────────────────────────────────────
  nudge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  nudgeText: {
    flex: 1,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },

  // ── Restore ────────────────────────────────────────────────────────────────
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    minHeight: 36,
  },
  restoreLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
