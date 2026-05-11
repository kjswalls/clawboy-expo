/**
 * UnlockToast — slides from top with haptic feedback.
 * Queues multiple unlocks with 150ms stagger.
 * Phase D: full cascade animation. Phase A: basic version.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, Spacing } from '@/constants/theme';
import type { NewUnlock } from '@/badges/types';
import { BADGE_BY_ID } from '@/badges/definitions';

interface Props {
  queue: NewUnlock[];
  onQueueConsumed: () => void;
}

const TOAST_DURATION_MS = 2500;
const STAGGER_MS = 150;

export function UnlockToast({ queue, onQueueConsumed }: Props): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<NewUnlock | null>(null);
  const [remaining, setRemaining] = useState<NewUnlock[]>([]);
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback((): void => {
    translateY.value = withTiming(-80, { duration: 250 });
    opacity.value = withTiming(0, { duration: 250 });
    timerRef.current = setTimeout(() => {
      setCurrent(null);
    }, 280);
  }, [translateY, opacity]);

  // Sync incoming queue — dedup by (id, tier) so same badge at higher tier shows again.
  useEffect(() => {
    if (queue.length === 0) return;
    setRemaining((prev) => {
      const existingKeys = new Set(prev.map((u) => `${u.id}:${u.tier ?? ''}`));
      const next = queue.filter((u) => !existingKeys.has(`${u.id}:${u.tier ?? ''}`));
      return [...prev, ...next];
    });
    onQueueConsumed();
  }, [queue, onQueueConsumed]);

  // Pop next from queue when nothing is showing.
  useEffect(() => {
    if (current !== null || remaining.length === 0) return;
    const [next, ...rest] = remaining;
    setRemaining(rest);
    setCurrent(next ?? null);
  }, [current, remaining]);

  // Animate in when current changes.
  useEffect(() => {
    if (!current) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    translateY.value = withDelay(STAGGER_MS, withSpring(0, { damping: 15, stiffness: 200 }));
    opacity.value = withDelay(STAGGER_MS, withTiming(1, { duration: 200 }));

    timerRef.current = setTimeout(() => {
      dismiss();
    }, TOAST_DURATION_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, dismiss, translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!current) return null;

  const def = BADGE_BY_ID[current.id];
  if (!def) return null;

  const tierLabel = current.tier !== undefined ? ` · ${t('badges.toast.tier', { n: current.tier + 1 })}` : '';

  return (
    <Animated.View
      style={[
        styles.toast,
        animStyle,
        {
          top: insets.top + 8,
          backgroundColor: colors.card,
          borderColor: `${colors.primary}44`,
        },
      ]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <Pressable
        onPress={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          dismiss();
        }}
        style={styles.inner}
        accessibilityRole="button"
        accessibilityLabel={`${def.name} ${t('badges.unlocked')}`}
      >
        <Text style={styles.emoji}>{def.icon}</Text>
        <View style={styles.text}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t('badges.unlocked')}{tierLabel}
          </Text>
          <Text style={[styles.name, { color: colors.foreground }]}>{def.name}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 9999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 10,
  },
  emoji: {
    fontSize: 28,
  },
  text: { flex: 1 },
  label: {
    fontSize: FontSize.xs,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
