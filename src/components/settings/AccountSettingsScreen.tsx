/**
 * AccountSettingsScreen — full-screen sub-page accessible via the gear button
 * on the account card in Settings.
 *
 * Contents:
 *  - Identity header (avatar, display name, email, tier pill)
 *  - If signed-out: sign-in CTA → SignInSheet
 *  - Founders Edition tiers + Restore Purchases
 *  - If signed-in: Sign Out + Delete Account
 */

import React, { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, ArrowLeft, ChevronRight, LogIn, LogOut, Trash2, Trophy, User } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { usePurchases } from '@/contexts/PurchasesContext';
import { FoundersBadge } from '@/components/common/FoundersBadge';
import { SettingsEditionSection } from './SettingsEditionSection';
import { PURCHASES_ENABLED } from '@/constants/featureFlags';
import { SignInSheet, type SignInSheetRef } from './SignInSheet';
import { useBadges, useBadgeState, usePinnedBadges } from '@/badges/hooks';
import { BadgePip } from '@/components/badges/BadgePip';
import { CompactSettingsSwitch } from './CompactSettingsSwitch';

// ─────────────────────────────────────────────────────────────────────────────
// AchievementsCard
// ─────────────────────────────────────────────────────────────────────────────

function AchievementsCard(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { isEnabled } = useBadges();
  const { enable, disable, resetAchievements, state } = useBadgeState();
  const pinned = usePinnedBadges();

  const hasData = state !== null && (
    Object.keys(state.unlocks).length > 0 ||
    state.counters.messagesSent > 0
  );

  const handleToggle = (): void => {
    if (isEnabled) {
      void disable();
    } else {
      void enable();
    }
  };

  const handleViewAll = (): void => {
    router.push('/settings/achievements');
  };

  const handleReset = (): void => {
    Alert.alert(
      t('settings.account.achievements.reset.alertTitle'),
      t('settings.account.achievements.reset.alertBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.account.achievements.reset.confirm'),
          style: 'destructive',
          onPress: () => { void resetAchievements(); },
        },
      ],
    );
  };

  const showPips = isEnabled && pinned.length > 0;

  return (
    <View style={[achStyles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {/* Slot A — pinned pip strip (only when enabled) */}
      {showPips && (
        <>
          <View style={achStyles.pipRow}>
            <View style={achStyles.pipGroup}>
              {pinned.map((b) => (
                <BadgePip key={b.id} badge={b} onPress={handleViewAll} />
              ))}
            </View>
          </View>
          <View style={[achStyles.divider, { backgroundColor: colors.border }]} />
        </>
      )}

      {/* Slot B — "View all trophies" link row */}
      <Pressable
        onPress={handleViewAll}
        style={({ pressed }) => [achStyles.linkRow, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={t('settings.account.achievements.viewAllTrophiesA11y')}
      >
        <Trophy size={16} color={colors.mutedForeground} />
        <Text style={[achStyles.linkLabel, { color: colors.foreground }]}>
          {t('settings.account.achievements.viewAllTrophiesLabel')}
        </Text>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Pressable>

      <View style={[achStyles.divider, { backgroundColor: colors.border }]} />

      {/* Slot C — Track achievements toggle */}
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [achStyles.toggleRow, pressed && { opacity: 0.75 }]}
        accessibilityRole="switch"
        accessibilityState={{ checked: isEnabled }}
        accessibilityLabel={t('settings.account.achievements.trackToggleA11y')}
      >
        <Activity size={16} color={colors.mutedForeground} />
        <View style={achStyles.toggleText}>
          <Text style={[achStyles.toggleLabel, { color: colors.foreground }]}>
            {t('settings.account.achievements.trackToggleLabel')}
          </Text>
          <Text style={[achStyles.toggleSub, { color: colors.mutedForeground }]}>
            {t('settings.account.achievements.trackToggleHint')}
          </Text>
        </View>
        <CompactSettingsSwitch value={isEnabled} />
      </Pressable>

      {/* Slot D — Reset (only when there's data to clear) */}
      {hasData && (
        <>
          <View style={[achStyles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [achStyles.resetRow, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings.account.achievements.reset.label')}
          >
            <Trash2 size={14} color={colors.destructive} />
            <View style={achStyles.resetText}>
              <Text style={[achStyles.resetLabel, { color: colors.destructive }]}>
                {t('settings.account.achievements.reset.label')}
              </Text>
              <Text style={[achStyles.resetHint, { color: colors.mutedForeground }]}>
                {t('settings.account.achievements.reset.hint')}
              </Text>
            </View>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function AccountSettingsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const { status, user, account, entitlement, signOut, deleteAccount } = useAccount();
  const { tier: rcTier } = usePurchases();
  const signInSheetRef = useRef<SignInSheetRef>(null);
  const [busy, setBusy] = useState(false);

  // Prefer the live RC tier; fall back to Supabase entitlement tier for legacy 'pro'.
  // When purchases are disabled, always show 'free' to avoid stale tier badges.
  const displayTier = PURCHASES_ENABLED
    ? (rcTier !== 'free' ? rcTier : (entitlement?.tier ?? 'free'))
    : 'free';
  const displayName = account?.display_name ?? user?.email ?? 'ClawBoy User';
  const emailLabel = user?.email ?? '';
  const provider = user?.app_metadata?.provider as string | undefined;
  const providerLabel =
    provider === 'apple' ? 'Apple' :
    provider === 'google' ? 'Google' :
    provider === 'email' ? 'Email' :
    null;

  const handleSignOut = (): void => {
    Alert.alert(t('settings.account.signOut.alertTitle'), t('settings.account.signOut.alertBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.account.signOut.button'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        },
      },
    ]);
  };

  const handleDeleteAccount = (): void => {
    Alert.alert(
      t('settings.account.deleteAccount.alertTitle'),
      t('settings.account.deleteAccount.alertBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.account.deleteAccount.button'),
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void deleteAccount().finally(() => setBusy(false));
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel={t('settings.account.closeLabel')}
          accessibilityRole="button"
        >
          <ArrowLeft size={18} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t('settings.account.headerTitle')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + Spacing.lg, 32) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
          {/* Identity card (signed-in only) */}
          {status === 'signed-in' && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.identityCard, { borderColor: `${colors.primary}28`, backgroundColor: `${colors.primary}0C` }]}
            >
              <View style={[styles.identityInner, { backgroundColor: colors.card }]}>
                <View style={[styles.avatar, { backgroundColor: `${colors.primary}30` }]}>
                  <User size={18} color={colors.primary} />
                </View>
                <View style={styles.identityInfo}>
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
                    <Text style={[styles.tierText, { color: colors.primary }]}>
                      {t('settings.account.tier.free')}
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          )}

          {/* Sign-in CTA (signed-out only) */}
          {status === 'signed-out' && (
            <Animated.View entering={FadeIn.duration(200)}>
              <Pressable
                onPress={() => signInSheetRef.current?.present()}
                style={({ pressed }) => [
                  styles.signInCard,
                  {
                    backgroundColor: `${colors.primary}0A`,
                    borderColor: `${colors.primary}25`,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                accessibilityLabel={t('settings.account.signIn.label')}
                accessibilityRole="button"
              >
                <View style={[styles.signInIconWrap, { backgroundColor: `${colors.primary}20` }]}>
                  <LogIn size={16} color={colors.primary} />
                </View>
                <View style={styles.signInTextWrap}>
                  <Text style={[styles.signInTitle, { color: colors.foreground }]}>
                    {t('settings.account.signIn.title')}
                  </Text>
                  <Text style={[styles.signInSub, { color: colors.mutedForeground }]}>
                    {t('settings.account.signIn.subtitle')}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          )}

          {/* Edition purchase / owned state */}
          {PURCHASES_ENABLED && (
            <View style={styles.foundersWrap}>
              <SettingsEditionSection />
            </View>
          )}

          {/* Achievements */}
          <AchievementsCard />

          {/* Sign Out + Delete Account (signed-in only) */}
          {status === 'signed-in' && (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={[styles.actionsCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Pressable
                onPress={handleSignOut}
                disabled={busy}
                style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.6 }]}
                accessibilityLabel={t('settings.account.signOut.label')}
                accessibilityRole="button"
              >
                <LogOut size={16} color={colors.mutedForeground} />
                <Text style={[styles.actionLabel, { color: colors.foreground }]}>
                  {t('settings.account.signOut.label')}
                </Text>
              </Pressable>

              <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

              <Pressable
                onPress={handleDeleteAccount}
                disabled={busy}
                style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.6 }]}
                accessibilityLabel={t('settings.account.deleteAccount.label')}
                accessibilityRole="button"
              >
                <Trash2 size={16} color={colors.destructive} />
                <Text style={[styles.actionLabel, { color: colors.destructive }]}>
                  {t('settings.account.deleteAccount.label')}
                </Text>
              </Pressable>
            </Animated.View>
          )}
      </ScrollView>

      <SignInSheet ref={signInSheetRef} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },

  // ── Identity card ────────────────────────────────────────────────────────
  identityCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  identityInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityInfo: { flex: 1, minWidth: 0 },
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

  // ── Sign-in CTA ──────────────────────────────────────────────────────────
  signInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  signInIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInTextWrap: { flex: 1 },
  signInTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  signInSub: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },

  // ── Edition section wrapper ──────────────────────────────────────────────
  foundersWrap: {
    // SettingsEditionSection already has marginBottom: Spacing.xl in its own styles
  },

  // ── Actions card ─────────────────────────────────────────────────────────
  actionsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
});

// ── Achievements card styles ──────────────────────────────────────────────────

const achStyles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  pipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pipGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleText: {
    flex: 1,
    minWidth: 0,
  },
  toggleLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  toggleSub: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  resetText: {
    flex: 1,
    minWidth: 0,
  },
  resetLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  resetHint: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
});
