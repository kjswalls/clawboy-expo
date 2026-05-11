/**
 * TrophyShelfScreen — full badge shelf.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Trophy } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, Spacing } from '@/constants/theme';
import { useBadges, useBadgeState, useEntitlements } from '@/badges/hooks';
import { usePurchases } from '@/contexts/PurchasesContext';
import { emitKonamiTriggered } from '@/badges/events';
import { BadgeGrid } from './BadgeGrid';
import { FoundersCountdown } from './FoundersCountdown';

const KONAMI_LENGTH = 10;
const KONAMI_WINDOW_MS = 5000;

export function TrophyShelfScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { totalEarned, totalCount, isEnabled, unseenCount } = useBadges();
  const { enable, markAllSeen } = useBadgeState();

  // Clear the unseen-dot indicators when the shelf is opened.
  useEffect(() => {
    if (unseenCount > 0) {
      void markAllSeen();
    }
  // Run only on mount; we don't want to re-trigger as unseenCount decrements.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { tier } = useEntitlements();
  const { foundersWindowRemainingMs } = usePurchases();
  const showFoundersCountdown = tier === 'founder' && foundersWindowRemainingMs > 0;

  // Konami code: 10 taps on the trophy icon within 5 seconds.
  const konamiTapsRef = useRef<number[]>([]);
  const handleTrophyTap = useCallback((): void => {
    const now = Date.now();
    konamiTapsRef.current = [
      ...konamiTapsRef.current.filter((t) => now - t < KONAMI_WINDOW_MS),
      now,
    ];
    if (konamiTapsRef.current.length >= KONAMI_LENGTH) {
      konamiTapsRef.current = [];
      emitKonamiTriggered();
    }
  }, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => { if (router.canGoBack()) router.back(); }}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={handleTrophyTap} style={styles.headerCenter} accessibilityLabel={t('badges.title')}>
          <Trophy size={16} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('badges.title')}</Text>
        </Pressable>
        <View style={styles.backBtn} pointerEvents="none" />
      </View>

      {/* Count subtitle */}
      <Animated.View entering={FadeIn.duration(200)} style={styles.subtitle}>
        <Text style={[styles.subtitleText, { color: colors.mutedForeground }]}>
          {t('badges.count', { earned: totalEarned, total: totalCount })}
        </Text>
        <Text style={[styles.hiddenHint, { color: colors.mutedForeground }]}>
          {t('badges.hiddenHint')}
        </Text>
        {showFoundersCountdown ? (
          <FoundersCountdown remainingMs={foundersWindowRemainingMs} />
        ) : null}
      </Animated.View>

      {!isEnabled ? (
        <View style={styles.disabledBanner}>
          <Text style={[styles.disabledText, { color: colors.mutedForeground }]}>
            {t('badges.disabledBody')}
          </Text>
          <Pressable
            onPress={() => { void enable(); }}
            style={({ pressed }) => [
              styles.enableBtn,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('badges.enable')}
          >
            <Text style={{ color: colors.foreground, fontSize: FontSize.sm, fontWeight: '600' }}>
              {t('badges.enable')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <BadgeGrid />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  subtitle: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  subtitleText: {
    fontSize: FontSize.xs,
  },
  hiddenHint: {
    fontSize: FontSize.xs,
    opacity: 0.6,
    marginTop: 2,
  },
  disabledBanner: {
    marginTop: Spacing.xs,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  disabledText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  enableBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
});
