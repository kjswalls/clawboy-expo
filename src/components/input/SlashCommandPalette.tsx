import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, Spacing } from '@/constants/theme';

import type { SlashCommandItem } from './slashCommands';
import type { PickerItem, PickerSection } from './InputBarPickerModal';
import { CommandsContent } from './palette/CommandsContent';
import { ArgsContent } from './palette/ArgsContent';
import { ModelsContent } from './palette/ModelsContent';
import { PaletteDetailFooter } from './palette/PaletteDetailFooter';

// ── Mode types ───────────────────────────────────────────────────────────────

type CommandsMode = {
  kind: 'commands';
  commands: SlashCommandItem[];
  /** Highlighted row index. -1 = nothing selected. */
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (cmd: SlashCommandItem) => void;
};

type ArgsMode = {
  kind: 'args';
  command: SlashCommandItem;
  options: string[];
  /** Highlighted row index. -1 = nothing selected. */
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (option: string) => void;
};

type ModelsMode = {
  kind: 'models';
  command: SlashCommandItem;
  sections: PickerSection[];
  /** Highlighted flat row index across all sections. -1 = nothing selected. */
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (item: PickerItem) => void;
};

export type PaletteMode = CommandsMode | ArgsMode | ModelsMode;

interface SlashCommandPaletteProps {
  /** Whether the palette should be visible. The component stays mounted either way. */
  visible: boolean;
  mode: PaletteMode;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SlashCommandPalette({ visible, mode }: SlashCommandPaletteProps): React.JSX.Element {
  const { colors } = useThemeContext();

  const isEmpty =
    mode.kind === 'commands'
      ? mode.commands.length === 0
      : mode.kind === 'args'
        ? mode.options.length === 0
        : mode.sections.every((s) => s.items.length === 0);

  const actuallyVisible = visible && !isEmpty;

  const selectedCommand: SlashCommandItem | null =
    mode.kind === 'commands'
      ? (mode.selectedIndex >= 0 ? (mode.commands[mode.selectedIndex] ?? null) : null)
      : mode.kind === 'args'
        ? mode.command
        : null;

  const selectedOption: string | undefined =
    mode.kind === 'args' && mode.selectedIndex >= 0
      ? mode.options[mode.selectedIndex]
      : undefined;

  const selectedModel: PickerItem | undefined =
    mode.kind === 'models' && mode.selectedIndex >= 0
      ? mode.sections.flatMap((s) => s.items)[mode.selectedIndex]
      : undefined;

  return (
    <View
      style={[styles.anchor, { opacity: actuallyVisible ? 1 : 0 }]}
      pointerEvents={actuallyVisible ? 'auto' : 'none'}
      accessibilityElementsHidden={!actuallyVisible}
      importantForAccessibility={actuallyVisible ? 'auto' : 'no-hide-descendants'}
    >
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
        {mode.kind === 'commands' ? (
          <CommandsContent
            commands={mode.commands}
            selectedIndex={mode.selectedIndex}
            onHighlight={mode.onHighlight}
            onSelect={mode.onSelect}
            colors={colors}
          />
        ) : mode.kind === 'args' ? (
          <ArgsContent
            command={mode.command}
            options={mode.options}
            selectedIndex={mode.selectedIndex}
            onHighlight={mode.onHighlight}
            onSelect={mode.onSelect}
            colors={colors}
          />
        ) : (
          <ModelsContent
            command={mode.command}
            sections={mode.sections}
            selectedIndex={mode.selectedIndex}
            onHighlight={mode.onHighlight}
            onSelect={mode.onSelect}
            colors={colors}
          />
        )}
        <PaletteDetailFooter
          mode={mode.kind}
          selectedCommand={selectedCommand}
          selectedOption={selectedOption}
          selectedModel={selectedModel}
          borderColor={colors.border}
          textColor={colors.foreground}
          mutedColor={colors.mutedForeground}
        />
      </View>
      </View>
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
});
