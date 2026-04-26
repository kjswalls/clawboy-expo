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

interface InputBarHeaderTogglesProps {
  showThinking: boolean;
  showToolCalls: boolean;
  onToggleThinking?: () => void;
  onToggleToolCalls?: () => void;
  onRefreshPress?: () => void;
  isRefreshing?: boolean;
}

export function InputBarHeaderToggles({
  showThinking,
  showToolCalls,
  onToggleThinking,
  onToggleToolCalls,
  onRefreshPress,
  isRefreshing = false,
}: InputBarHeaderTogglesProps): React.JSX.Element {
  const { colors } = useThemeContext();

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

  return (
    <View style={styles.row}>
      <Pressable
        onPress={handleToggleThinking}
        style={[styles.toggle, showThinking && activeShadow]}
        accessibilityLabel={showThinking ? 'Hide thinking' : 'Show thinking'}
        accessibilityRole="button"
        accessibilityState={{ selected: showThinking }}
      >
        <Brain size={16} color={showThinking ? colors.primary : colors.mutedForeground} />
      </Pressable>
      <Pressable
        onPress={handleToggleToolCalls}
        style={[styles.toggle, showToolCalls && activeShadow]}
        accessibilityLabel={showToolCalls ? 'Hide tool calls' : 'Show tool calls'}
        accessibilityRole="button"
        accessibilityState={{ selected: showToolCalls }}
      >
        <Wrench size={16} color={showToolCalls ? colors.primary : colors.mutedForeground} />
      </Pressable>
      <Pressable
        onPress={refreshDisabled ? undefined : handleRefresh}
        style={[styles.toggle, refreshDisabled && styles.toggleDisabled]}
        accessibilityLabel="Refresh chat"
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
