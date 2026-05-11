/**
 * BadgeDetailCTA — CTA / action cards rendered inside BadgeDetailModal's
 * scrollable content area (pin toggle, upgrade, Founders window, pro-locked).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pin, PinOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { PURCHASES_ENABLED } from '@/constants/featureFlags';
import type { ThemeColors } from '@/types';
import type { BadgeDisplayRecord } from '@/badges/hooks';

export interface BadgeDetailCTAProps {
  badge: BadgeDisplayRecord;
  isPinned: boolean;
  foundersWindowRemainingMs: number;
  colors: ThemeColors;
  onClose: () => void;
  onPinToggle: () => void;
}

export function BadgeDetailCTA({
  badge,
  isPinned,
  foundersWindowRemainingMs,
  colors,
  onClose,
  onPinToggle,
}: BadgeDetailCTAProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const router = useRouter();

  const isFoundersLocked = badge.visibleState === 'founders_locked';
  const isProLocked = badge.visibleState === 'pro_locked';
  const isEarned = badge.unlock !== null;
  const foundersWindowDays = Math.ceil(foundersWindowRemainingMs / (24 * 60 * 60 * 1000));

  return (
    <>
      {/* Founders-locked CTA */}
      {isFoundersLocked && !PURCHASES_ENABLED && (
        <View style={[styles.ctaCard, { backgroundColor: `${colors.muted}22`, borderColor: colors.border }]}>
          <Text style={[styles.ctaTitle, { color: colors.mutedForeground }]}>
            {t('badges.detail.foundersExclusive')}
          </Text>
          <Text style={[styles.ctaBody, { color: colors.mutedForeground }]}>
            {t('badges.detail.foundersComingSoon')}
          </Text>
        </View>
      )}

      {isFoundersLocked && PURCHASES_ENABLED && foundersWindowRemainingMs > 0 && (
        <View style={[styles.ctaCard, { backgroundColor: `${colors.warning}0A`, borderColor: `${colors.warning}33` }]}>
          <Text style={[styles.ctaTitle, { color: colors.warningText }]}>
            {t('badges.detail.foundersExclusive')}
          </Text>
          <Text style={[styles.ctaBody, { color: colors.mutedForeground }]}>
            {t('badges.window.closesIn', {
              days: foundersWindowDays,
              unit: t(foundersWindowDays === 1 ? 'badges.window.day' : 'badges.window.days'),
            })}
          </Text>
        </View>
      )}

      {isFoundersLocked && PURCHASES_ENABLED && foundersWindowRemainingMs <= 0 && (
        <View style={[styles.ctaCard, { backgroundColor: `${colors.muted}22`, borderColor: colors.border }]}>
          <Text style={[styles.ctaTitle, { color: colors.mutedForeground }]}>
            {t('badges.detail.foundersExclusive')}
          </Text>
          <Text style={[styles.ctaBody, { color: colors.mutedForeground }]}>
            {t('badges.detail.foundersClosedBody')}
          </Text>
        </View>
      )}

      {/* Pin / Unpin to Account Card */}
      {isEarned && (
        <Pressable
          onPress={onPinToggle}
          style={({ pressed }) => [
            styles.pinBtn,
            {
              backgroundColor: isPinned ? `${colors.primary}18` : colors.card,
              borderColor: isPinned ? `${colors.primary}55` : colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isPinned ? t('badges.detail.unpinFromCard') : t('badges.detail.pinToCard')}
        >
          {isPinned
            ? <PinOff size={14} color={colors.primary} />
            : <Pin size={14} color={colors.mutedForeground} />}
          <Text style={[styles.pinBtnLabel, { color: isPinned ? colors.primary : colors.mutedForeground }]}>
            {isPinned ? t('badges.detail.unpinFromCard') : t('badges.detail.pinToCard')}
          </Text>
        </Pressable>
      )}

      {/* Pro-locked CTA */}
      {isProLocked && PURCHASES_ENABLED && (
        <Pressable
          onPress={() => {
            onClose();
            router.push('/settings/account');
          }}
          style={({ pressed }) => [
            styles.upgradeBtn,
            {
              backgroundColor: `${colors.primary}18`,
              borderColor: `${colors.primary}55`,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('badges.detail.upgradeToUnlock')}
        >
          <Text style={[styles.upgradeBtnLabel, { color: colors.primary }]}>
            {t('badges.detail.upgradeToUnlock')}
          </Text>
        </Pressable>
      )}

      {isProLocked && !PURCHASES_ENABLED && (
        <View style={[styles.ctaCard, { backgroundColor: `${colors.muted}22`, borderColor: colors.border }]}>
          <Text style={[styles.ctaBody, { color: colors.mutedForeground, textAlign: 'center' }]}>
            {t('badges.detail.proComingSoon')}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  ctaCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  ctaTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  ctaBody: {
    fontSize: FontSize.xs,
  },
  upgradeBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  upgradeBtnLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  pinBtn: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pinBtnLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
