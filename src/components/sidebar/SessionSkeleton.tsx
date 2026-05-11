import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ShimmerLine } from '@/components/common/ShimmerLine';
import type { ThemeColors } from '@/types';

const SKELETON_WIDTHS = [180, 140, 200, 120] as const;

const skeletonStyles = {
  wrap: {
    gap: 8,
    paddingVertical: 4,
  },
  row: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
};

export function SessionSkeleton({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const pulse = useSharedValue(0.45);
  const shimmerX = useSharedValue(-80);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 750 }), withTiming(0.45, { duration: 750 })),
      -1,
      true,
    );
    shimmerX.value = withRepeat(withTiming(200, { duration: 1000 }), -1, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value }] }));

  return (
    <View style={skeletonStyles.wrap}>
      {SKELETON_WIDTHS.map((w, i) => (
        <View key={i} style={[skeletonStyles.row, { backgroundColor: colors.secondary }]}>
          <ShimmerLine
            baseColor={colors.muted}
            width={w}
            height={10}
            pulseStyle={pulseStyle}
            shimmerStyle={shimmerStyle}
          />
          <ShimmerLine
            baseColor={colors.muted}
            width={w * 0.65}
            height={8}
            pulseStyle={pulseStyle}
            shimmerStyle={shimmerStyle}
          />
        </View>
      ))}
    </View>
  );
}
