import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BorderRadius } from '@/constants/theme';

const COLORS = ['#A855F7', '#8B5CF6', '#6366F1', '#3B82F6', '#A855F7'] as const;

/** Extra size beyond the input card so the gradient shows as an edge ring (card sits on top). */
const GLOW_OUTSET = 4;
const OUTER_RADIUS = BorderRadius['2xl'] + GLOW_OUTSET;

interface InputRainbowGlowProps {
  isThinking: boolean;
}

/**
 * Edge glow aligned with the input card (same rounded rect).
 * Do not rotate the gradient layer — rotating a non-square rect skews it relative to the input.
 * Opacity pulse only keeps the effect “alive” while thinking.
 */
export function InputRainbowGlow({ isThinking }: InputRainbowGlowProps): React.JSX.Element | null {
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    if (isThinking) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.9, { duration: 1000 }),
          withTiming(0.6, { duration: 1000 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = 0;
    }
  }, [isThinking, opacity]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: isThinking ? opacity.value : 0,
  }));

  if (!isThinking) {
    return null;
  }

  return (
    <View style={styles.halo} pointerEvents="none">
      <Animated.View style={[styles.gradientShell, ringStyle]}>
        <LinearGradient
          colors={[...COLORS]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    ...StyleSheet.absoluteFillObject,
    top: -GLOW_OUTSET,
    left: -GLOW_OUTSET,
    right: -GLOW_OUTSET,
    bottom: -GLOW_OUTSET,
    zIndex: 0,
  },
  gradientShell: {
    flex: 1,
    borderRadius: OUTER_RADIUS,
    shadowColor: '#6366F1',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  gradient: {
    flex: 1,
    borderRadius: OUTER_RADIUS,
  },
});
