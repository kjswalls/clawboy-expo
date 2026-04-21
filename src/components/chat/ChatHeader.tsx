import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 48 : 32}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(168,85,247,0.45)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.hairline}
      />
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
    backgroundColor: 'rgba(15,18,25,0.75)',
  },
  hairline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
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
