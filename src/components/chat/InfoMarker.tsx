import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontSize } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export function InfoMarker({ text }: { text: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={infoStyles.row}>
      <View style={[infoStyles.line, { backgroundColor: colors.border }]} />
      <Text style={[infoStyles.label, { color: colors.mutedForeground }]}>{text}</Text>
      <View style={[infoStyles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  line: {
    flex: 1,
    height: 1,
    opacity: 0.5,
  },
  label: {
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
});
