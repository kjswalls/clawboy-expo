/**
 * AccountSection — the account card in Settings.
 *
 * States:
 *   unknown    — spinner while SecureStore is being read (renders nothing to avoid flash)
 *   signed-out — "Sign in (optional)" CTA + dismiss/ignore option
 *   signed-in  — avatar, display name, provider, tier pill; sign-out + delete account
 *
 * This component is fully optional — skipping sign-in never blocks any other feature.
 */

import React, { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LogIn, LogOut, Trash2, User } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAccount } from '@/hooks/useAccount';
import { SignInSheet, type SignInSheetRef } from './SignInSheet';

export function AccountSection(): React.JSX.Element {
  const { colors } = useTheme();
  const { status, user, account, entitlement, signOut, deleteAccount } = useAccount();
  const sheetRef = useRef<SignInSheetRef>(null);
  const [busy, setBusy] = useState(false);

  // Don't flash the card before we know auth state
  if (status === 'unknown') return <></>;

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Sign out of your ClawBoy account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your ClawBoy account and all cloud-synced data. Your gateway connections and chat history are stored on your device and gateway and are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void deleteAccount().finally(() => setBusy(false));
          },
        },
      ]
    );
  };

  if (status === 'signed-out') {
    return (
      <>
        <Animated.View entering={FadeIn.duration(200)}>
          <Pressable
            onPress={() => sheetRef.current?.present()}
            style={({ pressed }) => [
              styles.signedOutCard,
              {
                backgroundColor: `${colors.primary}0A`,
                borderColor: `${colors.primary}25`,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            accessibilityLabel="Sign in to ClawBoy (optional)"
            accessibilityRole="button"
          >
            <View style={[styles.signedOutIconWrap, { backgroundColor: `${colors.primary}20` }]}>
              <LogIn size={16} color={colors.primary} />
            </View>
            <View style={styles.signedOutText}>
              <Text style={[styles.signedOutTitle, { color: colors.foreground }]}>
                Sign in (optional)
              </Text>
              <Text style={[styles.signedOutSub, { color: colors.mutedForeground }]}>
                Restore gateway list on a new device
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        <SignInSheet ref={sheetRef} />
      </>
    );
  }

  // signed-in
  const displayName = account?.display_name ?? user?.email ?? 'ClawBoy User';
  const emailLabel = user?.email ?? '';
  const provider = user?.app_metadata?.provider as string | undefined;
  const providerLabel =
    provider === 'apple' ? 'Apple' :
    provider === 'google' ? 'Google' :
    provider === 'email' ? 'Email' :
    null;

  const tier = entitlement?.tier ?? 'free';
  const tierLabel = tier === 'free' ? 'Free' : tier === 'pro' ? 'Pro' : tier;

  return (
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
        <View style={[styles.tierPill, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
          <Text style={[styles.tierText, { color: colors.primary }]}>{tierLabel}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleSignOut}
          disabled={busy}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
        >
          <LogOut size={13} color={colors.mutedForeground} />
          <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Sign out</Text>
        </Pressable>

        <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

        <Pressable
          onPress={handleDeleteAccount}
          disabled={busy}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Delete account"
          accessibilityRole="button"
        >
          <Trash2 size={13} color={colors.destructive} />
          <Text style={[styles.actionLabel, { color: colors.destructive }]}>Delete account</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ── Signed-out card ─────────────────────────────────────────────────────────
  signedOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
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

  // ── Signed-in card ──────────────────────────────────────────────────────────
  signedInCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: 4,
    paddingBottom: 8,
    marginBottom: Spacing.xl,
  },
  innerRow: {
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

  // ── Actions row ─────────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  actionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 8,
  },
});
