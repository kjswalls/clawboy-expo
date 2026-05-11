import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BorderRadius, FontSize } from '@/constants/theme';
import type { SlashCommandCategory, SlashCommandItem } from '../slashCommands';
import { paletteStyles, translatedSlashDescription, type ThemeColors } from './shared';

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
    borderRadius: BorderRadius.sm,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});

type PaletteRow =
  | { kind: 'header'; category: SlashCommandCategory }
  | { kind: 'command'; command: SlashCommandItem; flatIndex: number };

interface CommandRowProps {
  command: SlashCommandItem;
  flatIndex: number;
  selected: boolean;
  onHighlight: (index: number) => void;
  onSelect: (cmd: SlashCommandItem) => void;
  colors: ThemeColors;
}

const CommandRow = React.memo(function CommandRow({
  command,
  flatIndex,
  selected,
  onHighlight,
  onSelect,
  colors,
}: CommandRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = command.icon;
  const isInstant = Boolean(command.executeLocal && !command.argOptions?.length);
  const hasOptions = (command.argOptions?.length ?? 0) > 0;
  const description = translatedSlashDescription(t, command);

  return (
    <Pressable
      onPress={() => onSelect(command)}
      onLongPress={() => onHighlight(flatIndex)}
      style={({ pressed }) => [
        paletteStyles.row,
        {
          backgroundColor: selected
            ? colors.primary + '1F'
            : pressed
              ? colors.secondary
              : 'transparent',
        },
      ]}
      accessibilityRole="menuitem"
      accessibilityLabel={`/${command.name} — ${description}`}
    >
      <Icon
        size={14}
        color={colors.primary}
        style={{ opacity: selected ? 1 : 0.7 }}
      />
      <View style={paletteStyles.textCol}>
        <View style={paletteStyles.nameRow}>
          <Text style={[paletteStyles.name, { color: selected ? colors.foreground : colors.primary }]}>
            /{command.name}
          </Text>
          {command.args ? (
            <Text style={[paletteStyles.argHint, { color: colors.mutedForeground }]}>
              {' '}{command.args}
            </Text>
          ) : null}
        </View>
      </View>
      <Text
        style={[paletteStyles.desc, { color: selected ? colors.foreground : colors.mutedForeground }]}
        numberOfLines={1}
      >
        {description}
      </Text>
      {isInstant ? (
        <Badge label={t('input.palette.instant')} primaryColor={colors.primary} />
      ) : hasOptions ? (
        <Badge label={t('input.palette.options', { count: command.argOptions!.length })} primaryColor={colors.primary} />
      ) : null}
    </Pressable>
  );
});

export interface CommandsContentProps {
  commands: SlashCommandItem[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (cmd: SlashCommandItem) => void;
  colors: ThemeColors;
}

export function CommandsContent({
  commands,
  selectedIndex,
  onHighlight,
  onSelect,
  colors,
}: CommandsContentProps): React.JSX.Element {
  const { t } = useTranslation();
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

  const renderRow = useCallback(({ item: row, index: i }: { item: PaletteRow; index: number }): React.JSX.Element => {
    if (row.kind === 'header') {
      return (
        <View key={`header-${i}-${row.category}`} style={paletteStyles.categoryRow}>
          <Text style={[paletteStyles.categoryLabel, { color: colors.mutedForeground }]}>
            {t(`input.slashCategories.${row.category}`)}
          </Text>
        </View>
      );
    }

    const { command, flatIndex } = row;
    return (
      <CommandRow
        command={command}
        flatIndex={flatIndex}
        selected={flatIndex === selectedIndex}
        onHighlight={onHighlight}
        onSelect={onSelect}
        colors={colors}
      />
    );
  }, [selectedIndex, onHighlight, onSelect, colors, t]);

  const keyExtractor = (row: PaletteRow, i: number): string => {
    if (row.kind === 'header') return `header-${i}-${row.category}`;
    return row.command.id;
  };

  return (
    <FlatList
      style={paletteStyles.list}
      contentContainerStyle={paletteStyles.listContent}
      data={rows}
      renderItem={renderRow}
      keyExtractor={keyExtractor}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      bounces={false}
      nestedScrollEnabled
    />
  );
}
