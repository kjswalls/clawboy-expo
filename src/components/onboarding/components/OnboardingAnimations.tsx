import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';

export interface SpringCheckCircleProps {
  colors: ThemeColors;
}

export function SpringCheckCircle({ colors }: SpringCheckCircleProps): React.JSX.Element {
  const scale = useSharedValue(0.7);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  }, [scale]);

  return (
    <Animated.View
      style={[
        styles.checkCircle,
        { backgroundColor: colors.muted, borderColor: colors.success },
        animStyle,
      ]}
    >
      <Check size={40} color={colors.success} />
    </Animated.View>
  );
}

export function HeroLogoSpring({ children }: { children: React.ReactNode }): React.JSX.Element {
  const scale = useSharedValue(0.86);
  const opacity = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    opacity.value = withDelay(80, withTiming(1, { duration: 300 }));
    scale.value = withDelay(80, withSpring(1, { damping: 11, stiffness: 180 }));
  }, [scale, opacity]);

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
});
