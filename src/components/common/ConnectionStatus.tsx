import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useThemeContext } from '@/contexts/ThemeContext';
import { FontSize, Spacing } from '@/constants/theme';

import { useTranslation } from 'react-i18next';

export type ConnectionDotStatus = 'connected' | 'connecting' | 'disconnected';

interface ConnectionStatusProps {
  status: ConnectionDotStatus;
  /** When false, only the dot is shown. */
  showLabel?: boolean;
  /** Override the label font size. Defaults to FontSize.xs. */
  labelSize?: number;
}

export function ConnectionStatus({
  status,
  showLabel = true,
  labelSize,
}: ConnectionStatusProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const LABELS: Record<ConnectionDotStatus, string> = {
    connected: t('settings.connection.connected'),
    connecting: t('settings.connection.connecting'),
    disconnected: t('settings.connection.disconnected'),
  };
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (status === 'connecting' || status === 'disconnected') {
      pulse.value = withRepeat(
        withSequence(withTiming(0.35, { duration: 650 }), withTiming(1, { duration: 650 })),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [status, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const dotColor =
    status === 'connected'
      ? colors.success
      : status === 'connecting'
        ? colors.warning
        : colors.destructive;

  const shouldPulse = status === 'connecting' || status === 'disconnected';

  return (
    <View
      style={styles.row}
      accessibilityLabel={t('common.connectionLabel', { status: LABELS[status] })}
      accessibilityRole="image"
    >
      {shouldPulse ? (
        <Animated.View style={[styles.dot, { backgroundColor: dotColor }, pulseStyle]} />
      ) : (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      )}
      {showLabel ? (
        <Text style={[styles.label, { color: colors.mutedForeground, fontSize: labelSize ?? FontSize.xs }]}>
          {LABELS[status]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: FontSize.xs,
  },
});
