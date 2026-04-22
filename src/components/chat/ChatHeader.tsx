import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Menu, Settings2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { APP_NAME } from '@/lib/appMeta';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

interface ChatHeaderProps {
  onMenuPress: () => void;
  onSettingsPress: () => void;
  title?: string;
}

export function ChatHeader({
  onMenuPress,
  onSettingsPress,
  title,
}: ChatHeaderProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();
  const displayTitle = title ?? APP_NAME;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel="Open menu"
          onPress={onMenuPress}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: pressed ? colors.secondary : 'transparent' },
          ]}
        >
          <Menu size={16} color={colors.mutedForeground} />
        </Pressable>

        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {displayTitle}
        </Text>

        <Pressable
          accessibilityLabel="Settings"
          onPress={onSettingsPress}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: pressed ? colors.secondary : 'transparent' },
          ]}
        >
          <Settings2 size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  iconBtn: {
    padding: 6,
    marginHorizontal: -6,
    borderRadius: BorderRadius.md,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.md,
    fontWeight: '600',
    marginHorizontal: Spacing.sm,
  },
});
