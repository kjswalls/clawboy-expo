import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontSize } from '@/constants/theme';
import type { ThemeColors } from '@/types';

export interface PairingInfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  valueColor?: string;
  hint?: string;
  colors: ThemeColors;
}

export function PairingInfoRow({ label, value, mono, muted, valueColor, hint, colors }: PairingInfoRowProps): React.JSX.Element {
  const textColor = valueColor ?? (muted ? colors.mutedForeground : colors.foreground);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
        <Text
          style={[styles.value, { color: textColor }, mono ? styles.mono : undefined]}
          numberOfLines={mono ? 2 : 1}
          ellipsizeMode="middle"
        >
          {value}
        </Text>
      </View>
      {hint ? (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  label: { fontSize: FontSize.xs, fontWeight: '500', flexShrink: 0 },
  value: { fontSize: FontSize.xs, flex: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 10 },
  hint: { fontSize: 10, textAlign: 'right', marginTop: 1, opacity: 0.7 },
});
