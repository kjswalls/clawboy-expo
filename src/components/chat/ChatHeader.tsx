import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Menu, Plus, Settings2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { APP_NAME } from '@/lib/appMeta';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

interface ChatHeaderProps {
  onMenuPress: () => void;
  onSettingsPress: () => void;
  /** Starts a new chat session (same as sidebar “new session”). */
  onNewSessionPress?: () => void;
  title?: string;
}

export function ChatHeader({
  onMenuPress,
  onSettingsPress,
  onNewSessionPress,
  title,
}: ChatHeaderProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();
  const displayTitle = title ?? APP_NAME;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.row}>
        <View style={styles.side}>
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
          {onNewSessionPress ? (
            <Pressable
              accessibilityLabel="New session"
              accessibilityHint="Starts a new chat with the current agent"
              onPress={onNewSessionPress}
              style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: pressed ? colors.secondary : 'transparent' },
              ]}
            >
              <Plus size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.titleSlot}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>

        <View style={[styles.side, styles.sideEnd]}>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  sideEnd: {
    justifyContent: 'flex-end',
  },
  titleSlot: {
    flex: 2,
    justifyContent: 'center',
    minWidth: 0,
  },
  iconBtn: {
    padding: 6,
    marginHorizontal: -6,
    borderRadius: BorderRadius.md,
  },
  title: {
    textAlign: 'center',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
