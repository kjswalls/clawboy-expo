/**
 * AccountSection — the account card in Settings.
 *
 * States:
 *   unknown    — spinner while SecureStore is being read (renders nothing to avoid flash)
 *   signed-out — "Sign in (optional)" CTA + gear button that opens Account Settings
 *   signed-in  — avatar, display name, provider, tier pill + gear button that opens Account Settings
 *
 * Sign Out and Delete Account have moved to AccountSettingsScreen.
 * The "Track achievements" toggle has also moved to AccountSettingsScreen.
 * This component is purely identity display + the account settings entry point.
 *
 * The accent strip below the inner card shows pinned badge pips + a "View all"
 * link when achievements are enabled and at least one badge is pinned/padded.
 * When achievements are disabled, the strip is hidden entirely.
 */

import React, { useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LogIn, Settings as SettingsIcon, User } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { usePurchases } from '@/contexts/PurchasesContext';
import { FoundersBadge } from '@/components/common/FoundersBadge';
import { PURCHASES_ENABLED } from '@/constants/featureFlags';
import { SignInSheet, type SignInSheetRef } from './SignInSheet';
import { useBadges, usePinnedBadges } from '@/badges/hooks';
import { BadgePip } from '@/components/badges/BadgePip';

// ─── PinnedBadgesStrip ────────────────────────────────────────────────────────

function PinnedBadgesStrip(): React.JSX.Element | null {
  const { colors } = useTheme();
  const router = useRouter();
  const { isEnabled } = useBadges();
  const pinned = usePinnedBadges();

  if (!isEnabled || pinned.length === 0) return null;

  const handleViewAll = (): void => {
    router.push('/settings/achievements');
  };

  return (
    <View style={stripStyles.strip}>
      <View style={stripStyles.badgeRow}>
        <View style={stripStyles.pipGroup}>
          {pinned.map((b) => (
            <BadgePip key={b.id} badge={b} onPress={handleViewAll} />
          ))}
        </View>
        <Pressable
          onPress={handleViewAll}
          hitSlop={6}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="View all achievements"
        >
          <Text style={[stripStyles.viewAll, { color: colors.primary }]}>View all</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function AccountSection(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { status, user, account, entitlement } = useAccount();
  const { tier: rcTier } = usePurchases();
  const sheetRef = useRef<SignInSheetRef>(null);

  // Don't flash the card before we know auth state
  if (status === 'unknown') return <></>;

  const displayName = account?.display_name ?? user?.email ?? 'ClawBoy User';
  const emailLabel = user?.email ?? '';
  const provider = user?.app_metadata?.provider as string | undefined;
  const providerLabel =
    provider === 'apple' ? 'Apple' :
    provider === 'google' ? 'Google' :
    provider === 'email' ? 'Email' :
    null;

  // Prefer the live RC tier; fall back to Supabase entitlement tier for legacy 'pro'.
  // When purchases are disabled, always show 'free' to avoid stale tier badges.
  const displayTier = PURCHASES_ENABLED
    ? (rcTier !== 'free' ? rcTier : (entitlement?.tier ?? 'free'))
    : 'free';

  return (
    <>
      {status === 'signed-out' ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <View
            style={[
              styles.signedOutCard,
              {
                backgroundColor: `${colors.primary}0A`,
                borderColor: `${colors.primary}25`,
              },
            ]}
          >
            {/* Main sign-in CTA row */}
            <View style={styles.signedOutTopRow}>
              <Pressable
                onPress={() => sheetRef.current?.present()}
                style={({ pressed }) => [styles.signedOutMain, pressed && { opacity: 0.8 }]}
                accessibilityLabel={t('settings.account.signIn.label')}
                accessibilityRole="button"
              >
                <View style={[styles.signedOutIconWrap, { backgroundColor: `${colors.primary}20` }]}>
                  <LogIn size={16} color={colors.primary} />
                </View>
                <View style={styles.signedOutText}>
                  <Text style={[styles.signedOutTitle, { color: colors.foreground }]}>
                    {t('settings.account.signIn.title')}
                  </Text>
                  <Text style={[styles.signedOutSub, { color: colors.mutedForeground }]}>
                    {t('settings.account.signIn.subtitle')}
                  </Text>
                </View>
              </Pressable>

              {/* Gear button — opens Account Settings (Founders Edition, etc.) */}
              <Pressable
                onPress={() => router.push('/settings/account')}
                hitSlop={8}
                style={({ pressed }) => [styles.gearBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Account settings"
                accessibilityRole="button"
              >
                <SettingsIcon size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <PinnedBadgesStrip />
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.signedInCard, { borderColor: `${colors.primary}28`, backgroundColor: `${colors.primary}0C` }]}
        >
          <View style={[styles.innerRow, { backgroundColor: colors.card }]}>
            <View style={[styles.avatar, { backgroundColor: `${colors.primary}30` }]}>
              <User size={18} color={colors.primary} />
            </View>
            <View style={styles.info}>
              <Text style={[styles.displayName, { color: colors.foreground }]} numberOfLines={1}>
                {displayName}
              </Text>
              {emailLabel ? (
                <Text style={[styles.emailText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {emailLabel}
                  {providerLabel ? ` · ${providerLabel}` : ''}
                </Text>
              ) : null}
            </View>
            {displayTier !== 'free' ? (
              <FoundersBadge tier={displayTier} />
            ) : (
              <View style={[styles.tierPill, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
                <Text style={[styles.tierText, { color: colors.primary }]}>Free</Text>
              </View>
            )}
            <Pressable
              onPress={() => router.push('/settings/account')}
              hitSlop={8}
              style={({ pressed }) => [styles.gearBtnInline, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Account settings"
              accessibilityRole="button"
            >
              <SettingsIcon size={15} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <PinnedBadgesStrip />
        </Animated.View>
      )}

      <SignInSheet ref={sheetRef} />
    </>
  );
}

const styles = StyleSheet.create({
  // ── Signed-out card ─────────────────────────────────────────────────────────
  signedOutCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingTop: Spacing.md,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    paddingBottom: 0,
    marginBottom: Spacing.xl,
  },
  signedOutTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.md,
  },
  signedOutMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  signedOutIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedOutText: { flex: 1 },
  signedOutTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  signedOutSub: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  gearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Signed-in card ──────────────────────────────────────────────────────────
  signedInCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: 4,
    paddingBottom: 0,
    marginBottom: Spacing.xl,
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: BorderRadius.lg,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  displayName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  emailText: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  tierPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tierText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },
  gearBtnInline: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});

const stripStyles = StyleSheet.create({
  strip: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pipGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  viewAll: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
