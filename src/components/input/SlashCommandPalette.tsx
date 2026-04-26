import { BlurView } from 'expo-blur';
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Terminal } from 'lucide-react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

import {
  CATEGORY_LABELS,
  type SlashCommandCategory,
  type SlashCommandItem,
} from './slashCommands';

// ── Mode types ──────────────────────────────────────────────────────────────

type CommandsMode = {
  kind: 'commands';
  commands: SlashCommandItem[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommandItem) => void;
};

type ArgsMode = {
  kind: 'args';
  command: SlashCommandItem;
  options: string[];
  selectedIndex: number;
  onSelect: (option: string) => void;
};

export type PaletteMode = CommandsMode | ArgsMode;

// Legacy flat props interface (commands mode only) — kept for back-compat.
interface SlashCommandPaletteProps {
  mode: PaletteMode;
}

type PaletteRow =
  | { kind: 'header'; category: SlashCommandCategory }
  | { kind: 'command'; command: SlashCommandItem; flatIndex: number };

// ── Badge ────────────────────────────────────────────────────────────────────

function Badge({ label, primaryColor }: { label: string; primaryColor: string }): React.JSX.Element {
  return (
    <View style={[badgeStyles.pill, { backgroundColor: primaryColor + '1F' }]}>
      <Text style={[badgeStyles.label, { color: primaryColor }]}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});

// ── Kbd shortcut chip ─────────────────────────────────────────────────────────

function KbdChip({ label, borderColor, textColor }: { label: string; borderColor: string; textColor: string }): React.JSX.Element {
  return (
    <View style={[kbdStyles.chip, { borderColor }]}>
      <Text style={[kbdStyles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const kbdStyles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  label: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

// ── Footer ────────────────────────────────────────────────────────────────────

function PaletteFooter({
  mode,
  borderColor,
  textColor,
}: {
  mode: 'commands' | 'args';
  borderColor: string;
  textColor: string;
}): React.JSX.Element {
  const items =
    mode === 'args'
      ? [
          { key: '↑↓', label: 'navigate' },
          { key: 'Tab', label: 'fill' },
          { key: 'Enter', label: 'run' },
          { key: 'Esc', label: 'close' },
        ]
      : [
          { key: '↑↓', label: 'navigate' },
          { key: 'Tab', label: 'fill' },
          { key: 'Enter', label: 'select' },
          { key: 'Esc', label: 'close' },
        ];

  return (
    <View style={[footerStyles.row, { borderTopColor: borderColor }]}>
      {items.map(({ key, label }, i) => (
        <View key={i} style={footerStyles.item}>
          <KbdChip label={key} borderColor={borderColor} textColor={textColor} />
          <Text style={[footerStyles.label, { color: textColor }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const footerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 10,
  },
});

// ── Commands mode ─────────────────────────────────────────────────────────────

function CommandsContent({
  commands,
  selectedIndex,
  onSelect,
  colors,
}: {
  commands: SlashCommandItem[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommandItem) => void;
  colors: ReturnType<typeof useThemeContext>['colors'];
}): React.JSX.Element {
  const safeIndex = Math.min(selectedIndex, Math.max(0, commands.length - 1));

  const rows = useMemo((): PaletteRow[] => {
    const result: PaletteRow[] = [];
    let lastCategory: SlashCommandCategory | null = null;
    let flatIndex = 0;
    for (const command of commands) {
      if (command.category !== lastCategory) {
        result.push({ kind: 'header', category: command.category });
        lastCategory = command.category;
      }
      result.push({ kind: 'command', command, flatIndex });
      flatIndex++;
    }
    return result;
  }, [commands]);

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      bounces={false}
      nestedScrollEnabled
    >
      {rows.map((row, i) => {
        if (row.kind === 'header') {
          return (
            <View key={`h-${i}`} style={styles.categoryRow}>
              <Text
                style={[
                  styles.categoryLabel,
                  { color: colors.primary, opacity: 0.7 },
                ]}
              >
                {CATEGORY_LABELS[row.category]}
              </Text>
            </View>
          );
        }

        const { command, flatIndex } = row;
        const Icon = command.icon;
        const selected = flatIndex === safeIndex;

        const isInstant = Boolean(command.executeLocal && !command.argOptions?.length);
        const hasOptions = (command.argOptions?.length ?? 0) > 0;

        return (
          <Pressable
            key={`r-${i}-${command.id}`}
            onPress={() => onSelect(command)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: selected
                  ? colors.primary + '1F'
                  : pressed
                    ? colors.secondary
                    : 'transparent',
              },
            ]}
          >
            <Icon
              size={14}
              color={colors.primary}
              style={{ opacity: selected ? 1 : 0.7 }}
            />
            <View style={styles.textCol}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: selected ? colors.foreground : colors.primary }]}>
                  /{command.name}
                </Text>
                {command.args ? (
                  <Text style={[styles.argHint, { color: colors.mutedForeground }]}>
                    {' '}{command.args}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text
              style={[styles.desc, { color: selected ? colors.foreground : colors.mutedForeground }]}
              numberOfLines={1}
            >
              {command.description}
            </Text>
            {isInstant ? (
              <Badge label="instant" primaryColor={colors.primary} />
            ) : hasOptions ? (
              <Badge label={`${command.argOptions!.length} options`} primaryColor={colors.primary} />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Args mode ─────────────────────────────────────────────────────────────────

function ArgsContent({
  command,
  options,
  selectedIndex,
  onSelect,
  colors,
}: {
  command: SlashCommandItem;
  options: string[];
  selectedIndex: number;
  onSelect: (option: string) => void;
  colors: ReturnType<typeof useThemeContext>['colors'];
}): React.JSX.Element {
  const safeIndex = Math.min(selectedIndex, Math.max(0, options.length - 1));

  return (
    <>
      <View style={[styles.argsHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.argsHeaderCmd, { color: colors.primary }]}>
          /{command.name}
        </Text>
        <Text style={[styles.argsHeaderDesc, { color: colors.primary, opacity: 0.8 }]}>
          {'  '}{command.description.toUpperCase()}
        </Text>
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
      >
        {options.map((opt, i) => {
          const selected = i === safeIndex;
          return (
            <Pressable
              key={opt}
              onPress={() => onSelect(opt)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: selected
                    ? colors.primary + '1F'
                    : pressed
                      ? colors.secondary
                      : 'transparent',
                },
              ]}
            >
              <Terminal size={14} color={colors.primary} style={{ opacity: selected ? 1 : 0.7 }} />
              <Text style={[styles.argsOptionLabel, { color: colors.foreground }]}>{opt}</Text>
              <Text style={[styles.argsOptionFull, { color: colors.mutedForeground }]}>
                /{command.name} {opt}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SlashCommandPalette({ mode }: SlashCommandPaletteProps): React.JSX.Element | null {
  const { colors } = useThemeContext();

  const isEmpty =
    mode.kind === 'commands' ? mode.commands.length === 0 : mode.options.length === 0;

  if (isEmpty) return null;

  return (
    <Animated.View entering={FadeInUp.duration(200)} style={styles.anchor}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 50 : 40}
        tint="dark"
        style={[styles.card, { borderColor: colors.border }]}
      >
        {mode.kind === 'commands' ? (
          <CommandsContent
            commands={mode.commands}
            selectedIndex={mode.selectedIndex}
            onSelect={mode.onSelect}
            colors={colors}
          />
        ) : (
          <ArgsContent
            command={mode.command}
            options={mode.options}
            selectedIndex={mode.selectedIndex}
            onSelect={mode.onSelect}
            colors={colors}
          />
        )}
        <PaletteFooter
          mode={mode.kind}
          borderColor={colors.border}
          textColor={colors.mutedForeground}
        />
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
    maxHeight: 320,
  },
  list: {
    flex: 0,
  },
  listContent: {
    paddingVertical: 4,
  },
  categoryRow: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 2,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  textCol: {
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  argHint: {
    fontSize: FontSize.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  desc: {
    flex: 1,
    fontSize: FontSize.xs,
    textAlign: 'right',
  },
  // Args mode
  argsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  argsHeaderCmd: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  argsHeaderDesc: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  argsOptionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  argsOptionFull: {
    fontSize: FontSize.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
