import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
    if (state.error === 'network' && state.hint === 'no_internet') return t('chat.connection.noInternet');
    if (state.error === 'auth_failed') return t('chat.connection.authFailed');
    if (state.error === 'cert_error') return t('chat.connection.certError');
    if (state.error === 'timeout') return t('chat.connection.timeoutRetry');
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
    maxHeight: 96 * open.value,
    marginBottom: Spacing.sm * open.value,
    transform: [{ translateY: -8 * (1 - open.value) }],
  }));

  let textColor: string;
  let message: string;

  if (isError) {
    textColor = colors.destructive;
    message = errorLabel(connectionState as ConnectionState & { status: 'error' });
  } else if (isIdentityRejected) {
    textColor = colors.destructive;
    message = t('chat.connection.identityRejected');
  } else {
    textColor = colors.mutedForeground;
    message = isPairing
      ? t('chat.connection.approvePairing')
      : isConnecting
        ? t('chat.connection.reconnecting')
        : t('chat.connection.disconnected');
  }

  const dotStatus = toDotStatus(status);
  const isActionable = isError || isIdentityRejected || isPairing;
  const canTap = isActionable && !!onPress;
  const showSettingsCta = isError && !!onPress;

  return (
    <Animated.View
      style={[styles.wrap, animatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
      accessibilityRole={isError ? 'alert' : undefined}
    >
      <View style={[styles.pillWrap, { backgroundColor: colors.secondary }]}>
        <Pressable
          onPress={canTap ? onPress : undefined}
          disabled={!canTap}
          style={({ pressed }) => [
            styles.inner,
            { backgroundColor: colors.secondary, borderColor: colors.border },
            pressed && canTap ? styles.pressed : null,
          ]}
        >
          <ConnectionStatus status={dotStatus} showLabel={false} />
          <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
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
          ) : (isPairing || isIdentityRejected) && onPress ? (
            <Text style={[styles.cta, { color: textColor }]}>{t('chat.connection.openSettings')}</Text>
          ) : null}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  pillWrap: {
    borderRadius: BorderRadius.full,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  text: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  cta: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: Spacing.xs,
  },
  pressed: {
    opacity: 0.86,
  },
});
