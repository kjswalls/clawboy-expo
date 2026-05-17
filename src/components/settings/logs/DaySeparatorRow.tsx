import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

interface DaySeparatorRowProps {
  label: string;
  direction: 'up' | 'down';
  colors: { border: string; mutedForeground: string };
}

export function DaySeparatorRow({ label, direction, colors }: DaySeparatorRowProps): React.JSX.Element {
  const Arrow = direction === 'up' ? ChevronUp : ChevronDown;
  const arrowLabel = direction === 'up' ? 'above' : 'below';
  return (
    <View
      style={sepStyles.row}
      accessible
      accessibilityLabel={`${label} — older logs ${arrowLabel}`}
    >
      <Arrow size={10} color={colors.mutedForeground} style={sepStyles.arrow} />
      <View style={[sepStyles.line, { backgroundColor: colors.border }]} />
      <Text style={[sepStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[sepStyles.line, { backgroundColor: colors.border }]} />
      <Arrow size={10} color={colors.mutedForeground} style={sepStyles.arrow} />
    </View>
  );
}

const sepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    paddingHorizontal: 6,
    gap: 4,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  arrow: {
    flexShrink: 0,
  },
});
