import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { ThemeColors } from '@/types';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
};

type Props<T extends string> = {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  colors: ThemeColors;
};

// Fixed segment dimensions — must match styles.segment / PILL_PADDING / SEGMENT_GAP.
const SEGMENT_W = 36;
const SEGMENT_H = 30;
const SEGMENT_GAP = 2;
const PILL_PADDING = 2;

function thumbLeft(index: number): number {
  return PILL_PADDING + index * (SEGMENT_W + SEGMENT_GAP);
}

const SPRING = { duration: 220, easing: Easing.out(Easing.cubic) };

export function SegmentedIconPill<T extends string>({
  value,
  options,
  onChange,
  colors,
}: Props<T>): React.JSX.Element {
  const activeIndex = options.findIndex((o) => o.value === value);

  // Animated thumb that slides to the active segment.
  const translateX = useSharedValue(thumbLeft(Math.max(0, activeIndex)));

  useEffect(() => {
    translateX.value = withTiming(thumbLeft(Math.max(0, activeIndex)), SPRING);
  }, [activeIndex, translateX]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.pill, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      {/* Sliding thumb renders behind icons */}
      <Animated.View
        style={[
          styles.thumb,
          { backgroundColor: colors.card, shadowColor: '#000' },
          thumbStyle,
        ]}
        pointerEvents="none"
      />

      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segment,
              !active && pressed && { opacity: 0.55 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={opt.label}
          >
            <opt.Icon
              size={15}
              strokeWidth={active ? 2.25 : 1.75}
              color={active ? colors.primary : colors.mutedForeground}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: PILL_PADDING,
    gap: SEGMENT_GAP,
    alignSelf: 'flex-start',
  },
  thumb: {
    position: 'absolute',
    top: PILL_PADDING,
    left: 0,
    width: SEGMENT_W,
    height: SEGMENT_H,
    borderRadius: 9999,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segment: {
    width: SEGMENT_W,
    height: SEGMENT_H,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
