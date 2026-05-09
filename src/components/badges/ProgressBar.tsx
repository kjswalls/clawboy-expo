import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  value: number;
  max: number;
  color?: string;
  height?: number;
}

export function ProgressBar({ value, max, color, height = 4 }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const trackColor = colors.border;
  const fillColor = color ?? colors.primary;

  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: fillColor,
            width: `${pct * 100}%`,
            height,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
