import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { ConnectionDotStatus } from '@/components/common/ConnectionStatus';
import { ConnectionStatus } from '@/components/common/ConnectionStatus';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ConnectionState } from '@/types';

interface ConnectionBannerProps {
  connectionState: ConnectionState;
  onPress?: () => void;
}

function toDotStatus(s: ConnectionState['status']): ConnectionDotStatus {
  if (s === 'connected') return 'connected';
  if (s === 'connecting') return 'connecting';
  return 'disconnected';
}

export function ConnectionBanner({ connectionState, onPress }: ConnectionBannerProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  function errorLabel(state: ConnectionState & { status: 'error' }): string {
    if (state.error === 'auth_failed') return t('chat.connection.authFailed');
    if (state.error === 'cert_error') return t('chat.connection.certError');
    if (state.error === 'network') {
      if (state.hint === 'check_tailscale') return t('chat.connection.tailnetUnreachable');
      return t('chat.connection.networkError');
    }
    return state.message.length > 0 ? state.message : t('chat.connection.connectionFailed');
  }

  // Reset dismiss when we leave the error state.
  useEffect(() => {
    if (connectionState.status !== 'error') setDismissed(false);
  }, [connectionState.status]);

  const { status } = connectionState;
  const isError = status === 'error';
  const isPairing = status === 'pairing_required';
  const isIdentityRejected = status === 'identity_rejected';
  const isConnecting = status === 'connecting';
  const isDisconnected = status === 'disconnected';

  const visible = (isError && !dismissed) || isPairing || isIdentityRejected || isConnecting || isDisconnected;

  const open = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    open.value = withTiming(visible ? 1 : 0, { duration: 180 });
  }, [open, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    maxHeight: 72 * open.value,
    marginBottom: Spacing.sm * open.value,
    transform: [{ translateY: -8 * (1 - open.value) }],
  }));

  let backgroundColor: string;
  let borderColor: string;
  let textColor: string;
  let message: string;

  if (isError) {
    backgroundColor = `${colors.destructive}14`;
    borderColor = `${colors.destructive}33`;
    textColor = colors.destructive;
    message = errorLabel(connectionState as ConnectionState & { status: 'error' });
  } else if (isIdentityRejected) {
    backgroundColor = `${colors.destructive}10`;
    borderColor = `${colors.destructive}30`;
    textColor = colors.destructive;
    message = t('chat.connection.identityRejected');
  } else {
    backgroundColor = `${colors.primary}0C`;
    borderColor = `${colors.primary}28`;
    textColor = colors.mutedForeground;
    message = isPairing
      ? t('chat.connection.approvePairing')
      : isConnecting
        ? t('chat.connection.reconnecting')
        : t('chat.connection.disconnected');
  }

  const dotStatus = toDotStatus(status);
  const canTap = !!onPress && !isError;
  const showSettingsCta = isError && onPress;

  return (
    <Animated.View
      style={[styles.wrap, animatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
      accessibilityRole={isError ? 'alert' : undefined}
    >
      <Pressable
        onPress={canTap ? onPress : undefined}
        disabled={!canTap}
        style={({ pressed }) => [
          styles.inner,
          { backgroundColor, borderColor },
          pressed && canTap ? styles.pressed : null,
        ]}
      >
        <ConnectionStatus status={dotStatus} showLabel={false} />
        <Text style={[styles.text, { color: textColor }]} numberOfLines={2}>
          {message}
        </Text>
        {isError ? (
          <Pressable
            onPress={() => {
              if (showSettingsCta) onPress?.();
              else setDismissed(true);
            }}
            hitSlop={8}
            style={({ pressed }) => pressed ? { opacity: 0.7 } : undefined}
            accessibilityLabel={showSettingsCta ? t('chat.connection.goToSettingsLabel') : t('chat.connection.dismissLabel')}
            accessibilityRole="button"
          >
            {showSettingsCta ? (
              <Text style={[styles.cta, { color: textColor }]}>{t('chat.connection.goToSettings')}</Text>
            ) : (
              <X size={12} color={textColor} />
            )}
          </Pressable>
        ) : canTap && visible ? (
          <Text style={[styles.cta, { color: textColor }]}>{t('chat.connection.openSettings')}</Text>
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
    minHeight: 36,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
  cta: {
    fontSize: 11,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.86,
  },
});
