import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Terminal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { SlashCommandItem } from '../slashCommands';
import { paletteStyles, translatedSlashDescription, type ThemeColors } from './shared';

interface ArgsOptionRowProps {
  option: string;
  index: number;
  commandName: string;
  selected: boolean;
  onHighlight: (index: number) => void;
  onSelect: (option: string) => void;
  colors: ThemeColors;
}

const ArgsOptionRow = React.memo(function ArgsOptionRow({
  option,
  index,
  commandName,
  selected,
  onHighlight,
  onSelect,
  colors,
}: ArgsOptionRowProps): React.JSX.Element {
  return (
    <Pressable
      onPress={() => onSelect(option)}
      onLongPress={() => onHighlight(index)}
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
      accessibilityLabel={`/${commandName} ${option}`}
    >
      <Terminal size={14} color={colors.primary} style={{ opacity: selected ? 1 : 0.7 }} />
      <Text style={[paletteStyles.argsOptionLabel, { color: selected ? colors.foreground : colors.primary }]}>{option}</Text>
      <Text style={[paletteStyles.argsOptionFull, { color: colors.mutedForeground }]}>
        /{commandName} {option}
      </Text>
    </Pressable>
  );
});

export interface ArgsContentProps {
  command: SlashCommandItem;
  options: string[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (option: string) => void;
  colors: ThemeColors;
}

export function ArgsContent({
  command,
  options,
  selectedIndex,
  onHighlight,
  onSelect,
  colors,
}: ArgsContentProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <View style={[paletteStyles.subHeader, { borderBottomColor: colors.border }]}>
        <Text style={[paletteStyles.subHeaderCmd, { color: colors.primary }]}>/{command.name}</Text>
        <Text style={[paletteStyles.subHeaderDesc, { color: colors.mutedForeground }]}>
          {translatedSlashDescription(t, command)}
        </Text>
      </View>
      <ScrollView
        style={paletteStyles.list}
        contentContainerStyle={paletteStyles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
      >
        {options.map((opt, i) => (
          <ArgsOptionRow
            key={opt}
            option={opt}
            index={i}
            commandName={command.name}
            selected={i === selectedIndex}
            onHighlight={onHighlight}
            onSelect={onSelect}
            colors={colors}
          />
        ))}
      </ScrollView>
    </>
  );
}
