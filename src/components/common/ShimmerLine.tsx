import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { BorderRadius } from '@/constants/theme';

interface ShimmerLineProps {
  baseColor: string;
  width: number | string;
  height?: number;
  pulseStyle: object;
  shimmerStyle: object;
  style?: ViewStyle;
}

export function ShimmerLine({
  baseColor,
  width,
  height = 12,
  pulseStyle,
  shimmerStyle,
  style,
}: ShimmerLineProps): React.JSX.Element {
  return (
    <Animated.View
      style={[
        styles.line,
        { backgroundColor: baseColor, width, height },
        pulseStyle,
        style,
      ]}
    >
      <Animated.View style={[styles.shimmer, shimmerStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  line: {
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
});
