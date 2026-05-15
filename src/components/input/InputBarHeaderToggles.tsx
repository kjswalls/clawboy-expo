import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Brain, RefreshCw, Wrench } from 'lucide-react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

interface InputBarHeaderTogglesProps {
  showThinking: boolean;
  showToolCalls: boolean;
  onToggleThinking?: () => void;
  onToggleToolCalls?: () => void;
  annotateModeActive?: boolean;
  onRefreshPress?: () => void;
  isRefreshing?: boolean;
}

export function InputBarHeaderToggles({
  showThinking,
  showToolCalls,
  onToggleThinking,
  onToggleToolCalls,
  annotateModeActive = false,
  onRefreshPress,
  isRefreshing = false,
}: InputBarHeaderTogglesProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();

  const rotation = useSharedValue(0);

  useEffect(() => {
    if (isRefreshing) {
      rotation.value = 0;
      rotation.value = withRepeat(
        withTiming(360, { duration: 800, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: 150 });
    }
  }, [isRefreshing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleToggleThinking = useCallback((): void => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleThinking?.();
  }, [onToggleThinking]);

  const handleToggleToolCalls = useCallback((): void => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleToolCalls?.();
  }, [onToggleToolCalls]);

  const handleRefresh = useCallback((): void => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRefreshPress?.();
  }, [onRefreshPress]);

  const activeShadow = {
    backgroundColor: colors.primary + '1A',
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  };

  const refreshDisabled = isRefreshing || !onRefreshPress;
  const internalTogglesDisabled = annotateModeActive;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={internalTogglesDisabled ? undefined : handleToggleThinking}
        style={[
          styles.toggle,
          showThinking && activeShadow,
          internalTogglesDisabled && styles.toggleDisabled,
        ]}
        accessibilityLabel={showThinking ? t('input.hideThinking') : t('input.showThinking')}
        accessibilityRole="button"
        accessibilityState={{ selected: showThinking, disabled: internalTogglesDisabled }}
      >
        <Brain size={16} color={showThinking ? colors.primary : colors.mutedForeground} />
      </Pressable>
      <Pressable
        onPress={internalTogglesDisabled ? undefined : handleToggleToolCalls}
        style={[
          styles.toggle,
          showToolCalls && activeShadow,
          internalTogglesDisabled && styles.toggleDisabled,
        ]}
        accessibilityLabel={showToolCalls ? t('input.hideToolCalls') : t('input.showToolCalls')}
        accessibilityRole="button"
        accessibilityState={{ selected: showToolCalls, disabled: internalTogglesDisabled }}
      >
        <Wrench size={16} color={showToolCalls ? colors.primary : colors.mutedForeground} />
      </Pressable>
      <Pressable
        onPress={refreshDisabled ? undefined : handleRefresh}
        style={[styles.toggle, refreshDisabled && styles.toggleDisabled]}
        accessibilityLabel={t('input.refreshChat')}
        accessibilityRole="button"
        accessibilityState={{ disabled: refreshDisabled }}
      >
        <Animated.View style={spinStyle}>
          <RefreshCw
            size={16}
            color={refreshDisabled ? colors.mutedForeground + '66' : colors.mutedForeground}
          />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toggle: {
    padding: 6,
    borderRadius: BorderRadius.md,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
});
