import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const SKELETON_ROWS = [0, 1, 2, 3, 4];

function SkeletonLine({
  baseColor,
  lineStyle,
  pulseStyle,
  shimmerStyle,
}: {
  baseColor: string;
  lineStyle: object;
  pulseStyle: object;
  shimmerStyle: object;
}): React.JSX.Element {
  return (
    <Animated.View style={[styles.line, { backgroundColor: baseColor }, lineStyle, pulseStyle]}>
      <Animated.View style={[styles.shimmer, shimmerStyle]} />
    </Animated.View>
  );
}

export function MessageListSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const pulse = useSharedValue(0.45);
  const shimmerX = useSharedValue(-80);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 750 }), withTiming(0.45, { duration: 750 })),
      -1,
      true
    );
    shimmerX.value = withRepeat(withTiming(280, { duration: 1100 }), -1, false);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <View style={styles.wrap}>
      {SKELETON_ROWS.map((row) => {
        const userRow = row % 2 === 1;
        return (
          <View key={row} style={[styles.rowWrap, userRow ? styles.rowRight : styles.rowLeft]}>
            {userRow ? (
              <View style={[styles.userBubble, { backgroundColor: colors.userBubble }]}>
                <SkeletonLine
                  baseColor={colors.muted}
                  lineStyle={styles.userLineWide}
                  pulseStyle={pulseStyle}
                  shimmerStyle={shimmerStyle}
                />
                <SkeletonLine
                  baseColor={colors.muted}
                  lineStyle={styles.userLineNarrow}
                  pulseStyle={pulseStyle}
                  shimmerStyle={shimmerStyle}
                />
              </View>
            ) : (
              <View style={styles.assistantLines}>
                <SkeletonLine
                  baseColor={colors.secondary}
                  lineStyle={styles.assistantLineWide}
                  pulseStyle={pulseStyle}
                  shimmerStyle={shimmerStyle}
                />
                <SkeletonLine
                  baseColor={colors.secondary}
                  lineStyle={styles.assistantLineMid}
                  pulseStyle={pulseStyle}
                  shimmerStyle={shimmerStyle}
                />
                <SkeletonLine
                  baseColor={colors.secondary}
                  lineStyle={styles.assistantLineShort}
                  pulseStyle={pulseStyle}
                  shimmerStyle={shimmerStyle}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  rowWrap: {
    maxWidth: '88%',
    gap: Spacing.xs,
  },
  rowLeft: {
    alignSelf: 'flex-start',
  },
  rowRight: {
    alignSelf: 'flex-end',
  },
  userBubble: {
    maxWidth: '92%',
    minWidth: 164,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius['2xl'],
    borderBottomRightRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  assistantLines: {
    maxWidth: '92%',
    paddingVertical: 2,
    gap: Spacing.sm,
  },
  line: {
    height: 12,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 56,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  userLineWide: {
    width: 170,
  },
  userLineNarrow: {
    width: 120,
  },
  assistantLineWide: {
    width: 250,
  },
  assistantLineMid: {
    width: 210,
  },
  assistantLineShort: {
    width: 145,
  },
});
