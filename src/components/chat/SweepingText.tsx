import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';
import { getGradientColors } from '@/types';

const BLOCK_W = 60;
const PAUSE_MS = 200;

interface SweepingTextProps {
  text: string;
  cycleMs?: number;
  baseColor?: string;
}

export function SweepingText({
  text,
  cycleMs = 1600,
  baseColor,
}: SweepingTextProps): React.JSX.Element {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion() ?? false;
  const base = baseColor ?? colors.mutedForeground;
  const gradientColors = getGradientColors(colors);

  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useSharedValue(-BLOCK_W);

  useEffect(() => {
    if (containerWidth <= 0) return;
    const sweepMs = cycleMs - PAUSE_MS;
    translateX.value = -BLOCK_W;
    translateX.value = withRepeat(
      withSequence(
        withTiming(containerWidth + BLOCK_W, {
          duration: sweepMs,
          easing: Easing.linear,
        }),
        withDelay(PAUSE_MS, withTiming(-BLOCK_W, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(translateX);
  }, [containerWidth, cycleMs, translateX]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  if (reducedMotion) {
    return <Text style={[styles.text, { color: colors.primary }]}>{text}</Text>;
  }

  return (
    <View onLayout={onLayout} style={styles.container}>
      {/* Invisible text establishes container dimensions */}
      <Text style={[styles.text, { opacity: 0 }]}>{text}</Text>
      {containerWidth > 0 && (
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <View style={StyleSheet.absoluteFill}>
              <Text style={styles.text}>{text}</Text>
            </View>
          }
        >
          {/* Base fill behind the animated strip */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: BLOCK_W,
              },
              animStyle,
            ]}
          >
            <LinearGradient
              colors={[base, ...gradientColors, base]}
              locations={[0, ...gradientColors.map((_, i) => (i + 1) / (gradientColors.length + 1)), 1] as unknown as readonly [number, number, ...number[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </MaskedView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
  },
});
