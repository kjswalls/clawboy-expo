/**
 * SettingsTipJarSection — in-app consumable tips + external tip link.
 *
 * Design intent (App Review compliance):
 * - Three in-app consumable tip buttons (one-tap, pays Apple's 15%).
 * - Separate "tip fee-free in browser" external link below.
 * - Both surfaces include clear copy: "These are gifts. They don't unlock anything in the app."
 * - On successful tip: light haptic feedback + small inline thanks message.
 * - Cancelled by user: silent. Errors: alert.
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
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { ExternalLink, Heart } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { usePurchases } from '@/contexts/PurchasesContext';
import { TIP_PRODUCTS } from '@/lib/purchases/products';
import type { TipProductId } from '@/lib/purchases/types';

// ─────────────────────────────────────────────────────────────────────────────
// Main section
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsTipJarSection(): React.JSX.Element {
  const { colors } = useTheme();
  const { offerings, purchaseTip } = usePurchases();
  const [busyTip, setBusyTip] = useState<TipProductId | null>(null);
  const [lastThanked, setLastThanked] = useState<TipProductId | null>(null);

  const tipJarUrl =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.tipJarUrl ?? '';

  function priceFor(tipId: TipProductId, defaultPrice: string): string {
    if (!offerings) return defaultPrice;
    for (const offering of Object.values(offerings.all)) {
      for (const pkg of offering.availablePackages) {
        const tip = TIP_PRODUCTS.find((t) => t.id === tipId);
        if (tip && pkg.product.identifier === tip.productId) {
          return pkg.product.priceString;
        }
      }
    }
    return defaultPrice;
  }

  const handleTip = async (tipId: TipProductId): Promise<void> => {
    if (busyTip) return;
    setLastThanked(null);
    setBusyTip(tipId);
    try {
      const result = await purchaseTip(tipId);
      if (result.status === 'success') {
        setLastThanked(tipId);
        setTimeout(() => setLastThanked(null), 3000);
      } else if (result.status === 'error') {
        Alert.alert('Tip Failed', result.message);
      }
      // cancelled → silent
    } finally {
      setBusyTip(null);
    }
  };

  const handleExternalTip = async (): Promise<void> => {
    if (!tipJarUrl || tipJarUrl.includes('REPLACE_WITH')) {
      Alert.alert('Not configured', 'External tip link is not set up yet.');
      return;
    }
    await WebBrowser.openBrowserAsync(tipJarUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.container}>
      {/* Heading */}
      <View style={styles.heading}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tip the Developer</Text>
        <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
          Just because — no in-app reward.
        </Text>
      </View>

      {/* In-app tip buttons */}
      <View style={[styles.tipCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.tipCardLabel, { color: colors.mutedForeground }]}>
          Quick tip via App Store
        </Text>
        <View style={styles.tipRow}>
          {TIP_PRODUCTS.map((tip) => {
            const isThisBusy = busyTip === tip.id;
            const isThanked = lastThanked === tip.id;
            const price = priceFor(tip.id, tip.defaultPriceLabel);

            return (
              <Pressable
                key={tip.id}
                onPress={() => { void handleTip(tip.id); }}
                disabled={!!busyTip}
                style={({ pressed }) => [
                  styles.tipBtn,
                  {
                    backgroundColor: isThanked
                      ? `${colors.success}18`
                      : `${colors.primary}12`,
                    borderColor: isThanked
                      ? `${colors.success}40`
                      : `${colors.primary}30`,
                    opacity: pressed && !busyTip ? 0.75 : 1,
                  },
                ]}
                accessibilityLabel={`Tip ${price}`}
                accessibilityRole="button"
              >
                {isThisBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : isThanked ? (
                  <>
                    <Heart size={12} color={colors.success} fill={colors.success} />
                    <Text style={[styles.tipBtnLabel, { color: colors.success }]}>Thanks!</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.tipBtnLabel, { color: colors.primary }]}>Tip</Text>
                    <Text style={[styles.tipBtnPrice, { color: colors.foreground }]}>{price}</Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* External "fee-free" link */}
      <Pressable
        onPress={() => { void handleExternalTip(); }}
        style={({ pressed }) => [
          styles.externalLink,
          { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityLabel="Tip the developer fee-free in your browser"
        accessibilityRole="link"
      >
        <Text style={[styles.externalLinkLabel, { color: colors.mutedForeground }]}>
          or tip fee-free in your browser
        </Text>
        <ExternalLink size={13} color={colors.mutedForeground} />
      </Pressable>

      {/* Compliance disclosure */}
      <Text style={[styles.disclosure, { color: colors.mutedForeground }]}>
        These are gifts. They don't unlock anything in the app.
      </Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  heading: {
    gap: 3,
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

  // ── Tip card ───────────────────────────────────────────────────────────────
  tipCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  tipCardLabel: {
    fontSize: FontSize.xs,
  },
  tipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: 10,
    minHeight: 42,
  },
  tipBtnLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  tipBtnPrice: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  // ── External link ──────────────────────────────────────────────────────────
  externalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.lg,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
  },
  externalLinkLabel: {
    fontSize: FontSize.xs,
  },

  // ── Disclosure ─────────────────────────────────────────────────────────────
  disclosure: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.lg,
    marginTop: 2,
  },
});
