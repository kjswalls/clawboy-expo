/**
 * BadgeDetailModal — centered card with prev/next navigation.
 * Swipe left/right or tap the chevron arrows to move between badges.
 */

import React, { useEffect } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Pin, PinOff, X } from 'lucide-react-native';
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { usePurchases } from '@/contexts/PurchasesContext';
import { PURCHASES_ENABLED } from '@/constants/featureFlags';
import { useBadgeState } from '@/badges/hooks';
import type { BadgeDisplayRecord } from '@/badges/hooks';
import { BADGE_BY_ID } from '@/badges/definitions';
import { BadgeTierSegments } from './BadgeTierSegments';

const SCREEN_H = Dimensions.get('window').height;
const CARD_MAX_H = Math.round(SCREEN_H * 0.6);

interface Props {
  badges: BadgeDisplayRecord[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 60;

export function BadgeDetailModal({ badges, index, onIndexChange, onClose }: Props): React.JSX.Element | null {
  // ── All hooks unconditionally first — never place an early return before these ──

  const { colors } = useTheme();
  const { t } = useTranslation();
  const { foundersWindowRemainingMs } = usePurchases();
  const { state, setPinnedBadges } = useBadgeState();
  const router = useRouter();

  const translateX = useSharedValue(0);

  // Derive stable values used by gesture — safe with null index.
  const safeIndex = index ?? 0;
  const badge = index !== null ? (badges[index] ?? null) : null;
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < badges.length - 1;

  const handlePrev = (): void => {
    if (index !== null && hasPrev) onIndexChange(index - 1);
  };

  const handleNext = (): void => {
    if (index !== null && hasNext) onIndexChange(index + 1);
  };

  // Horizontal pan gesture — defined unconditionally (references hasPrev/hasNext closures).
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      if ((!hasPrev && e.translationX > 0) || (!hasNext && e.translationX < 0)) {
        translateX.value = e.translationX * 0.25;
      } else {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD && hasNext) {
        translateX.value = withTiming(-300, { duration: 180 }, () => {
          runOnJS(handleNext)();
        });
      } else if (e.translationX > SWIPE_THRESHOLD && hasPrev) {
        translateX.value = withTiming(300, { duration: 180 }, () => {
          runOnJS(handlePrev)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  // useAnimatedStyle must be called unconditionally.
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Reset swipe position whenever the displayed badge changes.
  useEffect(() => {
    translateX.value = 0;
  }, [badge?.id, translateX]);

  // ── Early return after all hooks ─────────────────────────────────────────────
  if (index === null || !badge) return null;

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
        {/* Card */}
        <Pressable
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.cardInner, animStyle]}>
              {/* Close button */}
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel={t('badges.detail.close')}
                accessibilityRole="button"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>

              {/* Pinned chip in header */}
              {isPinned && (
                <View style={[styles.pinnedHeaderChip, { backgroundColor: `${colors.primary}22` }]}>
                  <Pin size={10} color={colors.primary} />
                  <Text style={[styles.pinnedHeaderLabel, { color: colors.primary }]}>{t('badges.detail.pinned')}</Text>
                </View>
              )}

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <Animated.View
                  key={badge.id}
                  entering={FadeIn.duration(150)}
                  style={styles.contentInner}
                >
                  {/* Badge icon */}
                  <Text style={styles.icon}>
                    {isFoundersLocked ? '🔒' : isProLocked ? '❓' : badge.icon}
                  </Text>

                  <Text style={[styles.name, { color: colors.foreground }]}>{badge.name}</Text>
                  <Text style={[styles.desc, { color: colors.mutedForeground }]}>{badge.description}</Text>

                  {/* Unlock date */}
                  {badge.unlock && (
                    <View style={[styles.metaRow, { borderColor: colors.border }]}>
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{t('badges.detail.unlocked')}</Text>
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
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{t('badges.detail.progress')}</Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]}>
                        {badge.currentValue.toLocaleString()} / {badge.nextThreshold.toLocaleString()}
                      </Text>
                    </View>
                  )}

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

                  {/* Pro-locked CTA — upgrade button (IAP enabled) or coming-soon card (not yet) */}
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

                </Animated.View>
              </ScrollView>
            </Animated.View>
          </GestureDetector>

          {/* Nav arrows inside card, absolute-positioned */}
          <Pressable
            onPress={handlePrev}
            hitSlop={12}
            disabled={!hasPrev}
            style={({ pressed }) => [
              styles.navBtnLeft,
              { opacity: !hasPrev ? 0.25 : pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('badges.detail.previous')}
            accessibilityState={{ disabled: !hasPrev }}
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </Pressable>

          <Pressable
            onPress={handleNext}
            hitSlop={12}
            disabled={!hasNext}
            style={({ pressed }) => [
              styles.navBtnRight,
              { opacity: !hasNext ? 0.25 : pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('badges.detail.next')}
            accessibilityState={{ disabled: !hasNext }}
          >
            <ChevronRight size={22} color={colors.foreground} />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    marginHorizontal: Spacing.md,
    maxWidth: 480,
    maxHeight: CARD_MAX_H,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  navBtnLeft: {
    position: 'absolute',
    left: 4,
    top: '50%',
    transform: [{ translateY: -18 }],
    padding: 6,
    zIndex: 2,
  },
  navBtnRight: {
    position: 'absolute',
    right: 4,
    top: '50%',
    transform: [{ translateY: -18 }],
    padding: 6,
    zIndex: 2,
  },
  cardInner: {},
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
    zIndex: 1,
  },
  pinnedHeaderChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    zIndex: 1,
  },
  pinnedHeaderLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  content: {
    flexGrow: 1,
  },
  contentInner: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: 44,
    gap: Spacing.md,
  },
  icon: {
    fontSize: 48,
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
    marginTop: Spacing.xs,
  },
  pinBtnLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
