/**
 * SettingsEditionSection — the purchase card that replaces the old multi-tier
 * Founders section. Branches on (tier, foundersWindowOpen):
 *
 *   tier === 'founder'                  → "You're a Founder" owned card
 *   tier === 'pro'                      → "ClawBoy Pro" owned card
 *   tier === 'free' && windowOpen       → Founders purchase card + countdown
 *   tier === 'free' && !windowOpen      → Pro purchase card + "Founders closed" notice
 *
 * Always rendered below the card: Restore Purchases + signed-out nudge.
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
import { CheckCircle, Lock, RotateCcw, Sparkles } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAccountContext } from '@/contexts/AccountContext';
import { usePurchases } from '@/contexts/PurchasesContext';
import { FOUNDERS_PRODUCT, PRO_PRODUCT } from '@/lib/purchases/products';
import type { OneTimeProductMeta } from '@/lib/purchases/types';
import type { PurchasesOfferings } from 'react-native-purchases';
import { FoundersCountdown } from '@/components/common/FoundersCountdown';

// ─────────────────────────────────────────────────────────────────────────────
// Accent colors
// ─────────────────────────────────────────────────────────────────────────────

const FOUNDER_ACCENT = '#FFB347'; // warm gold
const PRO_ACCENT = '#60A5FA';     // electric blue

// ─────────────────────────────────────────────────────────────────────────────
// Price helper
// ─────────────────────────────────────────────────────────────────────────────

function priceFor(meta: OneTimeProductMeta, offerings: PurchasesOfferings | null): string {
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

// ─────────────────────────────────────────────────────────────────────────────
// PurchaseCard — shown when tier is 'free', drives IAP
// ─────────────────────────────────────────────────────────────────────────────

interface PurchaseCardProps {
  meta: OneTimeProductMeta;
  accent: string;
  priceLabel: string;
  isLoading: boolean;
  onPress: () => Promise<void>;
  children?: React.ReactNode;
}

function PurchaseCard({ meta, accent, priceLabel, isLoading, onPress, children }: PurchaseCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handlePress = async (): Promise<void> => {
    if (busy || isLoading) return;
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
      disabled={busy || isLoading}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: `${accent}55`,
          backgroundColor: colors.card,
          opacity: pressed && !busy ? 0.88 : 1,
        },
      ]}
      accessibilityLabel={`${t(meta.id === 'founder' ? 'settings.edition.founders.cta' : 'settings.edition.pro.cta')} — ${priceLabel}`}
      accessibilityRole="button"
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: `${accent}20` }]}>
          <Sparkles size={15} color={accent} />
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {t(meta.id === 'founder' ? 'settings.edition.founders.title' : 'settings.edition.pro.title')}
          </Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {t(meta.id === 'founder' ? 'settings.edition.founders.subtitle' : 'settings.edition.pro.subtitle')}
          </Text>
        </View>
        <Text style={[styles.price, { color: colors.foreground }]}>{priceLabel}</Text>
      </View>

      {/* Extra slot (e.g. countdown pill) */}
      {children}

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
      <View style={[styles.ctaBtn, { backgroundColor: accent }]}>
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.ctaLabel}>
            {t(meta.id === 'founder' ? 'settings.edition.founders.cta' : 'settings.edition.pro.cta')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OwnedCard — shown when tier is 'founder' or 'pro'
// ─────────────────────────────────────────────────────────────────────────────

function OwnedCard({ tier }: { tier: 'founder' | 'pro' }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const accent = tier === 'founder' ? FOUNDER_ACCENT : PRO_ACCENT;
  const titleKey = tier === 'founder' ? 'settings.edition.owned.founder.title' : 'settings.edition.owned.pro.title';
  const subtitleKey = tier === 'founder' ? 'settings.edition.owned.founder.subtitle' : 'settings.edition.owned.pro.subtitle';
  const meta = tier === 'founder' ? FOUNDERS_PRODUCT : PRO_PRODUCT;

  return (
    <View style={[styles.card, { borderColor: `${accent}60`, backgroundColor: `${accent}0D` }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: `${accent}20` }]}>
          <CheckCircle size={15} color={accent} />
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t(titleKey)}</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{t(subtitleKey)}</Text>
        </View>
        <View style={[styles.ownedPill, { backgroundColor: `${accent}20`, borderColor: `${accent}50` }]}>
          <Text style={[styles.ownedPillText, { color: accent }]}>
            {t('settings.edition.ownedBadge')}
          </Text>
        </View>
      </View>

      {/* Perks summary */}
      <View style={styles.perks}>
        {meta.perks.map((perk) => (
          <View key={perk} style={styles.perkRow}>
            <View style={[styles.perkDot, { backgroundColor: accent }]} />
            <Text style={[styles.perkText, { color: colors.mutedForeground }]}>{perk}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main section
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsEditionSection(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { status } = useAccountContext();
  const {
    tier,
    isLoading,
    offerings,
    foundersWindowOpen,
    foundersWindowRemainingMs: remainingMs,
    purchaseFounders,
    purchasePro,
    restore,
  } = usePurchases();
  const [restoring, setRestoring] = useState(false);

  const handlePurchase = async (fn: () => Promise<{ status: string; message?: string }>): Promise<void> => {
    const result = await fn();
    if (result.status === 'error') {
      Alert.alert(t('settings.edition.purchaseFailed'), result.message ?? '');
    }
    // cancelled → silent; success → RC listener updates tier
  };

  const handleRestore = async (): Promise<void> => {
    setRestoring(true);
    try {
      await restore();
      Alert.alert(t('settings.edition.restoreSuccess'), t('settings.edition.restoreSuccessBody'));
    } catch {
      Alert.alert(t('settings.edition.restoreFailed'), t('settings.edition.restoreFailedBody'));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.container}>
      {/* Section heading */}
      <View style={styles.heading}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {t('settings.edition.sectionTitle')}
        </Text>
        <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
          {t('settings.edition.sectionSubtitle')}
        </Text>
      </View>

      {/* ── Owned states ─────────────────────────────────────────────────── */}
      {tier === 'founder' && <OwnedCard tier="founder" />}
      {tier === 'pro' && <OwnedCard tier="pro" />}

      {/* ── Free + window open → Founders purchase ───────────────────────── */}
      {tier === 'free' && foundersWindowOpen && (
        <>
          <PurchaseCard
            meta={FOUNDERS_PRODUCT}
            accent={FOUNDER_ACCENT}
            priceLabel={priceFor(FOUNDERS_PRODUCT, offerings)}
            isLoading={isLoading}
            onPress={() => handlePurchase(purchaseFounders)}
          >
            <FoundersCountdown remainingMs={remainingMs} />
          </PurchaseCard>
          <Text style={[styles.proFootnote, { color: colors.mutedForeground }]}>
            {t('settings.edition.proComingSoon')}
          </Text>
        </>
      )}

      {/* ── Free + window closed → Pro purchase ──────────────────────────── */}
      {tier === 'free' && !foundersWindowOpen && (
        <>
          <PurchaseCard
            meta={PRO_PRODUCT}
            accent={PRO_ACCENT}
            priceLabel={priceFor(PRO_PRODUCT, offerings)}
            isLoading={isLoading}
            onPress={() => handlePurchase(purchasePro)}
          />
          <Text style={[styles.foundersClosed, { color: colors.mutedForeground }]}>
            {t('settings.edition.foundersClosed.notice')}
          </Text>
        </>
      )}

      {/* ── Sign-in nudge (non-blocking) ─────────────────────────────────── */}
      {status === 'signed-out' && (
        <View style={[styles.nudge, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Lock size={13} color={colors.mutedForeground} />
          <Text style={[styles.nudgeText, { color: colors.mutedForeground }]}>
            {t('settings.edition.signInNudge')}
          </Text>
        </View>
      )}

      {/* ── Restore Purchases — required by App Review ───────────────────── */}
      <Pressable
        onPress={() => { void handleRestore(); }}
        disabled={restoring}
        style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.6 }]}
        accessibilityLabel={t('settings.edition.restore')}
        accessibilityRole="button"
      >
        {restoring
          ? <ActivityIndicator size="small" color={colors.mutedForeground} />
          : (
            <>
              <RotateCcw size={13} color={colors.mutedForeground} />
              <Text style={[styles.restoreLabel, { color: colors.mutedForeground }]}>
                {t('settings.edition.restore')}
              </Text>
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

  // ── Card ───────────────────────────────────────────────────────────────────
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardTitleWrap: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  cardSub: {
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  price: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },

  // ── Owned pill ─────────────────────────────────────────────────────────────
  ownedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginTop: 2,
  },
  ownedPillText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },

  // ── Perks ──────────────────────────────────────────────────────────────────
  perks: {
    gap: 5,
    paddingLeft: 2,
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
    flexShrink: 0,
  },
  perkText: {
    fontSize: FontSize.xs,
    lineHeight: 18,
    flex: 1,
  },

  // ── CTA button ─────────────────────────────────────────────────────────────
  ctaBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
    minHeight: 38,
  },
  ctaLabel: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  // ── Footnotes ──────────────────────────────────────────────────────────────
  proFootnote: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.lg,
  },
  foundersClosed: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.lg,
  },

  // ── Sign-in nudge ──────────────────────────────────────────────────────────
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
