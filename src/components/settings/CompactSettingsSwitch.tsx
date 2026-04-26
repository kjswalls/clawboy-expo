import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';

const KNOB_X_OFF = 2;
const KNOB_X_ON = 16;
const KNOB_TRAVEL = KNOB_X_ON - KNOB_X_OFF;

const TIMING_MS = 200;
const TIMING_CONFIG = {
  duration: TIMING_MS,
  easing: Easing.inOut(Easing.cubic),
} as const;

type CompactSettingsSwitchProps = {
  value: boolean;
};

/**
 * Compact iOS-style pill used for settings rows (36×20). Parent should be a
 * `Pressable` with `accessibilityRole="switch"` and handle toggling.
 */
export function CompactSettingsSwitch({ value }: CompactSettingsSwitchProps): React.JSX.Element {
  const { colors } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, TIMING_CONFIG);
  }, [value]);

  const trackStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [colors.secondary, colors.primary],
      ),
    }),
    [colors.secondary, colors.primary],
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: KNOB_X_OFF + progress.value * KNOB_TRAVEL }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.track, trackStyle]}>
      <Animated.View style={[styles.knob, knobStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 36,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
  },
  knob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
});
