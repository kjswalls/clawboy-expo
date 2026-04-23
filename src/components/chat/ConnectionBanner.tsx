import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { ConnectionDotStatus } from '@/components/common/ConnectionStatus';
import { ConnectionStatus } from '@/components/common/ConnectionStatus';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

interface ConnectionBannerProps {
  status: ConnectionDotStatus;
  onPress?: () => void;
}

const VISIBLE_HEIGHT = 36;

const MESSAGE_BY_STATUS: Record<Exclude<ConnectionDotStatus, 'connected'>, string> = {
  connecting: 'Reconnecting to server...',
  disconnected: 'Disconnected. Reconnecting...',
};

export function ConnectionBanner({ status, onPress }: ConnectionBannerProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const open = useSharedValue(status === 'connected' ? 0 : 1);
  const visible = status !== 'connected';

  useEffect(() => {
    open.value = withTiming(visible ? 1 : 0, { duration: 180 });
  }, [open, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    maxHeight: VISIBLE_HEIGHT * open.value,
    marginBottom: Spacing.sm * open.value,
    transform: [{ translateY: -8 * (1 - open.value) }],
  }));

  const backgroundColor = status === 'disconnected' ? `${colors.destructive}26` : `${colors.warning}1F`;
  const textColor = status === 'disconnected' ? colors.destructive : colors.warningText;

  return (
    <Animated.View
      style={[styles.wrap, animatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          styles.inner,
          { backgroundColor, borderColor: colors.border },
          pressed && onPress ? styles.pressed : null,
        ]}
      >
        <ConnectionStatus status={status} showLabel={false} />
        <Text style={[styles.text, { color: textColor }]}>
          {visible ? MESSAGE_BY_STATUS[status] : ''}
        </Text>
        {onPress && visible ? (
          <Text style={[styles.cta, { color: textColor }]}>Open settings</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    marginHorizontal: Spacing.lg,
  },
  inner: {
    minHeight: VISIBLE_HEIGHT,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  text: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  cta: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.86,
  },
});
