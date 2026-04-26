import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

import { ChevronRight } from 'lucide-react-native';

import { ConnectionStatus, type ConnectionDotStatus } from '@/components/common/ConnectionStatus';
import { useThemeContext } from '@/contexts/ThemeContext';
import { Spacing } from '@/constants/theme';

interface InputBarInfoRowProps {
  selectedAgent?: string;
  selectedModel?: string;
  connectionStatus: ConnectionDotStatus;
  contextUsed?: number;
  contextTotal?: number;
  onPressContext?: () => void;
}

export function InputBarInfoRow({
  selectedAgent,
  selectedModel,
  connectionStatus,
  contextUsed,
  contextTotal,
  onPressContext,
}: InputBarInfoRowProps): React.JSX.Element {
  const { colors } = useThemeContext();

  const handlePressContext = useCallback((): void => {
    void Haptics.selectionAsync();
    onPressContext?.();
  }, [onPressContext]);

  const pct =
    contextUsed !== undefined && contextTotal !== undefined && contextTotal > 0
      ? Math.round((contextUsed / contextTotal) * 100)
      : null;

  const contextColor =
    pct === null
      ? colors.mutedForeground
      : pct >= 90
        ? colors.destructive
        : pct >= 75
          ? '#F59E0B'
          : colors.mutedForeground;

  // Subtle opacity pulse when context is ≥ 95% full
  const pulseOpacity = useSharedValue(1);
  const shouldPulse = pct !== null && pct >= 95;

  useEffect(() => {
    if (shouldPulse) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.45, { duration: 900 }),
          withTiming(1, { duration: 900 }),
        ),
        -1,
        false,
      );
    } else {
      pulseOpacity.value = withTiming(1, { duration: 300 });
    }
  }, [shouldPulse, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  // Compact label for the status bar — just the percentage (or a dash when unknown)
  const contextLabel = pct !== null ? `${pct}% ctx` : '— ctx';

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
      <Pressable onPress={handlePressContext} disabled={!onPressContext} hitSlop={6}>
        <Animated.View style={[styles.ctxRow, pulseStyle]}>
          <Text style={[styles.ctxText, { color: contextColor }]}>{contextLabel}</Text>
          {onPressContext ? (
            <ChevronRight size={10} color={contextColor} strokeWidth={2.5} style={styles.ctxChevron} />
          ) : null}
        </Animated.View>
      </Pressable>
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
  ctxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 0,
  },
  ctxText: {
    fontSize: 10,
    flexShrink: 0,
  },
  ctxChevron: {
    marginLeft: -1,
    opacity: 0.75,
  },
});
