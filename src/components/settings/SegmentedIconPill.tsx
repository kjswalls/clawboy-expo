import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

export function SegmentedIconPill<T extends string>({
  value,
  options,
  onChange,
  colors,
}: Props<T>): React.JSX.Element {
  return (
    <View style={[styles.pill, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segment,
              active && [styles.segmentActive, { backgroundColor: colors.card, shadowColor: '#000' }],
              !active && pressed && { opacity: 0.55 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={opt.label}
          >
            <opt.Icon
              size={13}
              strokeWidth={active ? 2.25 : 1.75}
              color={active ? colors.foreground : colors.mutedForeground}
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
    padding: 2,
    gap: 2,
    alignSelf: 'center',
  },
  segment: {
    width: 30,
    height: 26,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
