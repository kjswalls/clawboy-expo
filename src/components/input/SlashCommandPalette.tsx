import { BlurView } from 'expo-blur';
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

import { SLASH_COMMANDS, type SlashCommandItem } from './slashCommands';

interface SlashCommandPaletteProps {
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommandItem) => void;
}

export function SlashCommandPalette({
  query,
  selectedIndex,
  onSelect,
}: SlashCommandPaletteProps): React.JSX.Element | null {
  const { colors } = useThemeContext();

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q),
    );
  }, [query]);

  if (filtered.length === 0) {
    return null;
  }

  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  return (
    <Animated.View entering={FadeInUp.duration(200)} style={styles.anchor}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 50 : 40}
        tint="dark"
        style={[styles.card, { borderColor: colors.border }]}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerText, { color: colors.mutedForeground }]}>Commands</Text>
        </View>
        <View style={styles.list}>
          {filtered.map((command, index) => {
            const Icon = command.icon;
            const selected = index === safeIndex;
            return (
              <Pressable
                key={command.id}
                onPress={() => onSelect(command)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: selected
                      ? colors.ring + '33'
                      : pressed
                        ? colors.secondary
                        : 'transparent',
                  },
                ]}
              >
                <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
                  <Icon size={16} color={colors.mutedForeground} />
                </View>
                <View style={styles.textCol}>
                  <Text style={[styles.name, { color: colors.foreground }]}>/{command.name}</Text>
                  <Text style={[styles.desc, { color: colors.mutedForeground }]}>
                    {command.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: '100%',
    marginBottom: Spacing.sm,
    zIndex: 60,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 280,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    fontSize: FontSize.xs,
  },
  list: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  desc: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
