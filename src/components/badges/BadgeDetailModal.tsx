/**
 * BadgeDetailModal — tapped from BadgeCard.
 * Shows badge details, progress, unlock date, upgrade CTA for locked badges.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pin, PinOff, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { usePurchases } from '@/contexts/PurchasesContext';
import { useBadgeState } from '@/badges/hooks';
import type { BadgeDisplayRecord } from '@/badges/hooks';
import { BADGE_BY_ID } from '@/badges/definitions';
import { BadgeTierSegments } from './BadgeTierSegments';

interface Props {
  badge: BadgeDisplayRecord | null;
  onClose: () => void;
}

export function BadgeDetailModal({ badge, onClose }: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  const { foundersWindowRemainingMs } = usePurchases();
  const { state, setPinnedBadges } = useBadgeState();
  const router = useRouter();

  if (!badge) return null;

  const isFoundersLocked = badge.visibleState === 'founders_locked';
  const isProLocked = badge.visibleState === 'pro_locked';
  const isEarned = badge.unlock !== null;
  const foundersWindowDays = Math.ceil(foundersWindowRemainingMs / (24 * 60 * 60 * 1000));

  const pinnedIds = state?.cosmetics.displayedBadges ?? [];
  const isPinned = pinnedIds.includes(badge.id);

  const handlePinToggle = (): void => {
    if (isPinned) {
      void setPinnedBadges(pinnedIds.filter((id) => id !== badge.id));
    } else {
      // Max 3 pinned — add to end, keep last 3.
      void setPinnedBadges([...pinnedIds, badge.id].slice(-3));
    }
  };

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Close button */}
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <X size={18} color={colors.mutedForeground} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Badge icon */}
            <Text style={styles.icon}>
              {isFoundersLocked ? '🔒' : isProLocked ? '❓' : badge.icon}
            </Text>

            <Text style={[styles.name, { color: colors.foreground }]}>{badge.name}</Text>
            <Text style={[styles.desc, { color: colors.mutedForeground }]}>{badge.description}</Text>

            {/* Unlock date */}
            {badge.unlock && (
              <View style={[styles.metaRow, { borderColor: colors.border }]}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Unlocked</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {new Date(badge.unlock.unlockedAt).toLocaleDateString()}
                </Text>
              </View>
            )}

            {/* Tier ladder for track badges */}
            {(() => {
              const def = BADGE_BY_ID[badge.id];
              if (!def?.tiers) return null;
              const reachedIdx = badge.unlock?.tier ?? -1;
              return (
                <View style={[styles.tierSection, { borderColor: colors.border }]}>
                  <BadgeTierSegments badgeId={badge.id} reachedTierIdx={reachedIdx} size="md" />
                </View>
              );
            })()}

            {/* Progress for in-progress */}
            {badge.visibleState === 'in_progress' && badge.currentValue !== null && badge.nextThreshold !== null && (
              <View style={[styles.metaRow, { borderColor: colors.border }]}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Progress</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {badge.currentValue.toLocaleString()} / {badge.nextThreshold.toLocaleString()}
                </Text>
              </View>
            )}

            {/* Founders-locked CTA */}
            {isFoundersLocked && foundersWindowRemainingMs > 0 && (
              <View style={[styles.ctaCard, { backgroundColor: `${colors.warning}0A`, borderColor: `${colors.warning}33` }]}>
                <Text style={[styles.ctaTitle, { color: colors.warningText }]}>
                  Founders Edition exclusive
                </Text>
                <Text style={[styles.ctaBody, { color: colors.mutedForeground }]}>
                  Closes in {foundersWindowDays} {foundersWindowDays === 1 ? 'day' : 'days'}
                </Text>
              </View>
            )}

            {isFoundersLocked && foundersWindowRemainingMs <= 0 && (
              <View style={[styles.ctaCard, { backgroundColor: `${colors.muted}22`, borderColor: colors.border }]}>
                <Text style={[styles.ctaTitle, { color: colors.mutedForeground }]}>
                  Founders Edition exclusive
                </Text>
                <Text style={[styles.ctaBody, { color: colors.mutedForeground }]}>
                  The Founders Edition window has closed.
                </Text>
              </View>
            )}

            {/* Pin / Unpin to Account Card */}
            {isEarned && (
              <Pressable
                onPress={handlePinToggle}
                style={({ pressed }) => [
                  styles.pinBtn,
                  {
                    backgroundColor: isPinned ? `${colors.primary}18` : colors.card,
                    borderColor: isPinned ? `${colors.primary}55` : colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={isPinned ? 'Unpin from Account Card' : 'Pin to Account Card'}
              >
                {isPinned
                  ? <PinOff size={14} color={colors.primary} />
                  : <Pin size={14} color={colors.mutedForeground} />}
                <Text style={[styles.pinBtnLabel, { color: isPinned ? colors.primary : colors.mutedForeground }]}>
                  {isPinned ? 'Unpin from Account Card' : 'Pin to Account Card'}
                </Text>
              </Pressable>
            )}

            {/* Pro-locked upgrade CTA */}
            {isProLocked && (
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/settings/account');
                }}
                style={({ pressed }) => [
                  styles.upgradeBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Upgrade to unlock"
              >
                <Text style={[styles.upgradeBtnLabel, { color: colors.primaryForeground }]}>
                  Upgrade to unlock
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 20,
    maxHeight: '70%',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
    zIndex: 1,
  },
  content: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  icon: {
    fontSize: 56,
  },
  name: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  desc: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tierSection: {
    width: '100%',
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaLabel: {
    fontSize: FontSize.sm,
  },
  metaValue: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
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
    marginTop: Spacing.xs,
  },
  pinBtnLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
