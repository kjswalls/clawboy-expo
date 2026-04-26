import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ShimmerLine } from '@/components/common/ShimmerLine';

const SKELETON_ROW_COUNT = 20;

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
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => i).map((row) => {
        const userRow = row % 2 === 1;
        return (
          <View key={row} style={[styles.rowWrap, userRow ? styles.rowRight : styles.rowLeft]}>
            {userRow ? (
              <View style={[styles.userBubble, { backgroundColor: colors.userBubble }]}>
                <ShimmerLine baseColor={colors.muted} width={170} pulseStyle={pulseStyle} shimmerStyle={shimmerStyle} />
                <ShimmerLine baseColor={colors.muted} width={120} pulseStyle={pulseStyle} shimmerStyle={shimmerStyle} />
              </View>
            ) : (
              <View style={styles.assistantLines}>
                <ShimmerLine baseColor={colors.secondary} width={250} pulseStyle={pulseStyle} shimmerStyle={shimmerStyle} />
                <ShimmerLine baseColor={colors.secondary} width={210} pulseStyle={pulseStyle} shimmerStyle={shimmerStyle} />
                <ShimmerLine baseColor={colors.secondary} width={145} pulseStyle={pulseStyle} shimmerStyle={shimmerStyle} />
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
    overflow: 'hidden',
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
    borderRadius: 20,
    borderBottomRightRadius: 6,
    gap: Spacing.sm,
  },
  assistantLines: {
    maxWidth: '92%',
    paddingVertical: 2,
    gap: Spacing.sm,
  },
});
