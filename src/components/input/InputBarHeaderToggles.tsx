import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Brain, RefreshCw, Wrench } from 'lucide-react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius } from '@/constants/theme';

interface InputBarHeaderTogglesProps {
  showThinking: boolean;
  showToolCalls: boolean;
  onToggleThinking?: () => void;
  onToggleToolCalls?: () => void;
  onRefreshPress?: () => void;
}

export function InputBarHeaderToggles({
  showThinking,
  showToolCalls,
  onToggleThinking,
  onToggleToolCalls,
  onRefreshPress,
}: InputBarHeaderTogglesProps): React.JSX.Element {
  const { colors } = useThemeContext();

  const activeShadow = {
    backgroundColor: colors.primary + '1A',
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggleThinking}
        style={[styles.toggle, showThinking && activeShadow]}
      >
        <Brain size={16} color={showThinking ? colors.primary : colors.mutedForeground} />
      </Pressable>
      <Pressable
        onPress={onToggleToolCalls}
        style={[styles.toggle, showToolCalls && activeShadow]}
      >
        <Wrench size={16} color={showToolCalls ? colors.primary : colors.mutedForeground} />
      </Pressable>
      <Pressable onPress={onRefreshPress} style={styles.toggle}>
        <RefreshCw size={16} color={colors.mutedForeground} />
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
});
