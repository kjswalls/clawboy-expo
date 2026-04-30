import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Square } from 'lucide-react-native';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const BAR_COUNT = 4;
const BAR_MIN_H = 3;
const BAR_MAX_H = 14;
const BAR_DURATION = 320;
const BAR_DELAY = 110;

function WaveformBar({ index, active }: { index: number; active: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const height = useSharedValue(BAR_MIN_H);

  useEffect(() => {
    if (active) {
      height.value = withDelay(
        index * BAR_DELAY,
        withRepeat(
          withSequence(
            withTiming(BAR_MAX_H, { duration: BAR_DURATION }),
            withTiming(BAR_MIN_H, { duration: BAR_DURATION }),
          ),
          -1,
          false,
        ),
      );
    } else {
      height.value = withTiming(BAR_MIN_H, { duration: 200 });
    }
  }, [active, height, index]);

  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[styles.bar, barStyle, { backgroundColor: colors.primary }]}
    />
  );
}

interface AudioPlayingPillProps {
  onStop: () => void;
}

export function AudioPlayingPill({ onStop }: AudioPlayingPillProps): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onStop}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: colors.secondary,
          borderColor: colors.border,
        },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityLabel="Stop audio playback"
      accessibilityRole="button"
    >
      <View style={styles.waveform}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <WaveformBar key={i} index={i} active />
        ))}
      </View>
      <Text style={[styles.label, { color: colors.foreground }]}>Speaking</Text>
      <Square size={12} color={colors.foreground} fill={colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: BAR_MAX_H,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
