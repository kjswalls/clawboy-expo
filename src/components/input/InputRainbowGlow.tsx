import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/** Extra size beyond the input card so the gradient shows as an edge ring (card sits on top). */
const GLOW_OUTSET = 4;
const OUTER_RADIUS = BorderRadius['2xl'] + GLOW_OUTSET;

/**
 * - `'response'` — agent is streaming or about to stream a reply; full animated pulse.
 * - `'background'` — agent is doing maintenance work (reset/compact/busy); calm fixed glow.
 * - `null` — no glow (renders nothing).
 */
export type GlowVariant = 'response' | 'background' | null;

interface InputRainbowGlowProps {
  variant: GlowVariant;
}

/**
 * Edge glow aligned with the input card (same rounded rect).
 * Do not rotate the gradient layer — rotating a non-square rect skews it relative to the input.
 * `'response'` pulses; `'background'` is a calm fixed ring.
 */
export function InputRainbowGlow({ variant }: InputRainbowGlowProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const glowColors = [
    colors.primary,
    colors.accentViolet,
    colors.accentIndigo,
    colors.accentBlue,
    colors.primary,
  ] as readonly [ColorValue, ColorValue, ...ColorValue[]];
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (variant === 'response') {
      opacity.value = withSequence(
        withTiming(0.65, { duration: 300, easing: Easing.out(Easing.quad) }),
        withRepeat(
          withTiming(0.9, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
        ),
      );
    } else if (variant === 'background') {
      cancelAnimation(opacity);
      opacity.value = withTiming(0.35, { duration: 400 });
    } else {
      cancelAnimation(opacity);
      opacity.value = withTiming(0, { duration: 300 });
    }
  }, [variant, opacity]);

  const isBackground = variant === 'background';

  const ringStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    shadowOpacity: isBackground ? 0.15 : 0.35,
    shadowRadius: isBackground ? 8 : 14,
  }));

  if (!variant) {
    return null;
  }

  return (
    <View style={styles.halo} pointerEvents="none">
      <Animated.View style={[styles.gradientShell, { shadowColor: colors.accentIndigo }, ringStyle]}>
        <LinearGradient
          colors={glowColors}
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
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  gradient: {
    flex: 1,
    borderRadius: OUTER_RADIUS,
  },
});
