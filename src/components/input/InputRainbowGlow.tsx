import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
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

const COLORS = ['#A855F7', '#8B5CF6', '#6366F1', '#3B82F6', '#A855F7'] as const;

interface InputRainbowGlowProps {
  isThinking: boolean;
}

export function InputRainbowGlow({ isThinking }: InputRainbowGlowProps): React.JSX.Element | null {
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    if (isThinking) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 8000, easing: Easing.linear }),
        -1,
        false,
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.9, { duration: 1000 }),
          withTiming(0.6, { duration: 1000 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
      cancelAnimation(opacity);
      rotation.value = 0;
      opacity.value = 0;
    }
  }, [isThinking, opacity, rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: isThinking ? opacity.value : 0,
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (!isThinking) {
    return null;
  }

  return (
    <View style={styles.halo} pointerEvents="none">
      <Animated.View style={[styles.spinner, ringStyle]}>
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

const SIZE = 220;

const styles = StyleSheet.create({
  halo: {
    ...StyleSheet.absoluteFillObject,
    margin: -2,
    borderRadius: BorderRadius['2xl'] + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: SIZE,
    height: SIZE,
    shadowColor: '#6366F1',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  gradient: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
});
