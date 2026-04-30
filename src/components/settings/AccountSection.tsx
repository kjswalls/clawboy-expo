/**
 * AccountSection — the account card in Settings.
 *
 * States:
 *   unknown    — spinner while SecureStore is being read (renders nothing to avoid flash)
 *   signed-out — "Sign in (optional)" CTA + gear button that opens Account Settings
 *   signed-in  — avatar, display name, provider, tier pill + gear button that opens Account Settings
 *
 * Sign Out and Delete Account have moved to AccountSettingsScreen.
 * This component is purely identity display + the account settings entry point.
 */

import React, { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LogIn, Settings as SettingsIcon, User } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { usePurchases } from '@/contexts/PurchasesContext';
import { FoundersBadge } from '@/components/common/FoundersBadge';
import { SignInSheet, type SignInSheetRef } from './SignInSheet';
import { AccountSettingsScreen } from './AccountSettingsScreen';

export function AccountSection(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { status, user, account, entitlement } = useAccount();
  const { tier: rcTier } = usePurchases();
  const sheetRef = useRef<SignInSheetRef>(null);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

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
  const displayTier = rcTier !== 'free' ? rcTier : (entitlement?.tier ?? 'free');

  // SignInSheet and AccountSettingsScreen are rendered unconditionally (outside
  // the signed-in/signed-out branches) so that the Modal is never unmounted
  // mid-presentation. If SignInSheet were only rendered in the signed-out branch,
  // the auth-state change that fires during signInWithGoogle() would cause React
  // to unmount the Modal before its dismiss animation completes, leaving a black
  // UIWindow on screen on iOS.
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
            {/* Main sign-in CTA (fills most of card) */}
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
              onPress={() => setAccountSettingsOpen(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.gearBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Account settings"
              accessibilityRole="button"
            >
              <SettingsIcon size={16} color={colors.mutedForeground} />
            </Pressable>
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
              onPress={() => setAccountSettingsOpen(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.gearBtnInline, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Account settings"
              accessibilityRole="button"
            >
              <SettingsIcon size={15} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      <SignInSheet ref={sheetRef} />
      <AccountSettingsScreen
        visible={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // ── Signed-out card ─────────────────────────────────────────────────────────
  signedOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    marginBottom: Spacing.xl,
    gap: 0,
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
