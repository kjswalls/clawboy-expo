import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConnectionStatus, type ConnectionDotStatus } from '@/components/common/ConnectionStatus';
import { useThemeContext } from '@/contexts/ThemeContext';
import { FontSize, Spacing } from '@/constants/theme';

interface InputBarInfoRowProps {
  selectedAgent?: string;
  selectedModel?: string;
  connectionStatus: ConnectionDotStatus;
  contextUsed: number;
  contextTotal: number;
}

export function InputBarInfoRow({
  selectedAgent,
  selectedModel,
  connectionStatus,
  contextUsed,
  contextTotal,
}: InputBarInfoRowProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const pct =
    contextTotal > 0 ? Math.round((contextUsed / contextTotal) * 100) : 0;

  return (
    <View style={[styles.infoBar, { backgroundColor: colors.card }]}>
      <Text style={[styles.infoAgent, { color: colors.foreground + 'CC' }]} numberOfLines={1}>
        {selectedAgent ?? '—'}
      </Text>
      <Text style={[styles.pipe, { color: colors.mutedForeground }]}>|</Text>
      <ConnectionStatus status={connectionStatus} />
      <Text style={[styles.pipe, { color: colors.mutedForeground }]}>|</Text>
      <Text style={[styles.infoMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
        {selectedModel ?? '—'}
      </Text>
      <Text style={[styles.pipe, { color: colors.mutedForeground }]}>|</Text>
      <Text style={[styles.infoMeta, { color: colors.mutedForeground }]}>
        {Math.round(contextUsed / 1000)}k/{Math.round(contextTotal / 1000)}k ({pct}%)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: 0,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  infoAgent: {
    fontSize: 10,
    fontWeight: '500',
    maxWidth: '28%',
  },
  pipe: {
    fontSize: 10,
    lineHeight: 14,
    marginHorizontal: 5,
    opacity: 0.55,
  },
  infoMeta: {
    fontSize: 10,
    maxWidth: '32%',
  },
});
