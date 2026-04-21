import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BorderRadius, Colors, Spacing } from '@/constants/theme';

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

export function StreamingText(): React.JSX.Element {
  return (
    <View style={styles.pill}>
      <TypingDot delayMs={0} />
      <TypingDot delayMs={200} />
      <TypingDot delayMs={400} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.secondary,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(139, 139, 139, 0.5)',
  },
});
