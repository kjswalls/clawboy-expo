import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const CYCLE_MS = 1400;
const UP_MS = Math.round(CYCLE_MS * 0.3);
const DOWN_MS = Math.round(CYCLE_MS * 0.3);
const HOLD_MS = CYCLE_MS - UP_MS - DOWN_MS;
const BOUNCE_OFFSET = -4;

function TypingDot({ delayMs }: { delayMs: number }): React.JSX.Element {
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(BOUNCE_OFFSET, { duration: UP_MS, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: DOWN_MS, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: HOLD_MS }),
        ),
        -1,
        false,
      ),
    );
  }, [delayMs, y]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View style={[styles.dot, style]} />
  );
}

export function StreamingText({ label }: { label?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const pill = (
    <View style={[styles.pill, { backgroundColor: colors.secondary }]}>
      <TypingDot delayMs={0} />
      <TypingDot delayMs={200} />
      <TypingDot delayMs={400} />
    </View>
  );

  if (label) {
    return (
      <View style={styles.row}>
        {pill}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
    );
  }

  return pill;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(139, 139, 139, 0.5)',
  },
  label: {
    fontSize: 12,
  },
});
