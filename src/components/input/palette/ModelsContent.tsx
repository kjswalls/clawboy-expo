import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/common/ProviderIcon';
import { formatCtxWindow } from '@/lib/formatTokens';
import type { SlashCommandItem } from '../slashCommands';
import type { PickerItem, PickerSection } from '../InputBarPickerModal';
import { paletteStyles, translatedSlashDescription, type ThemeColors } from './shared';

interface ModelRowProps {
  item: PickerItem;
  currentIdx: number;
  selected: boolean;
  onHighlight: (index: number) => void;
  onSelect: (item: PickerItem) => void;
  colors: ThemeColors;
}

const ModelRow = React.memo(function ModelRow({
  item,
  currentIdx,
  selected,
  onHighlight,
  onSelect,
  colors,
}: ModelRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const hasMetaLine = Boolean(item.subtitle || item.contextWindow);

  return (
    <Pressable
      onPress={() => onSelect(item)}
      onLongPress={() => onHighlight(currentIdx)}
      style={({ pressed }) => [
        paletteStyles.modelRow,
        (hasMetaLine || item.reasoning) ? paletteStyles.modelRowTall : undefined,
        {
          backgroundColor: selected
            ? colors.primary + '1F'
            : pressed
              ? colors.secondary
              : 'transparent',
        },
      ]}
      accessibilityRole="menuitem"
      accessibilityLabel={item.subtitle ? `${item.title} — ${item.subtitle}` : item.title}
      accessibilityState={{ selected }}
    >
      {item.providerSlug ? (
        <ProviderIcon
          slug={item.providerSlug}
          color={item.dot}
          fallbackChar={item.title.charAt(0)}
          size={18}
        />
      ) : (
        <View style={[paletteStyles.modelDot, { backgroundColor: item.dot }]}>
          <Text style={paletteStyles.modelDotLetter}>{item.title.charAt(0)}</Text>
        </View>
      )}
      <View style={paletteStyles.modelTextCol}>
        <Text style={[paletteStyles.modelName, { color: colors.foreground }]} numberOfLines={1}>
          {item.title}
        </Text>
        {(hasMetaLine || item.reasoning) ? (
          <View style={paletteStyles.modelMeta}>
            {item.subtitle ? (
              <Text style={[paletteStyles.modelSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
            {item.subtitle && item.contextWindow ? (
              <Text style={[paletteStyles.modelMetaDivider, { color: colors.mutedForeground }]}>·</Text>
            ) : null}
            {item.contextWindow ? (
              <Text style={[paletteStyles.modelCtx, { color: colors.mutedForeground }]}>
                {formatCtxWindow(item.contextWindow)}
              </Text>
            ) : null}
            {item.reasoning ? (
              <View style={[paletteStyles.modelBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
                <Text style={[paletteStyles.modelBadgeText, { color: colors.primary }]}>{t('input.palette.reasoning')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

export interface ModelsContentProps {
  command: SlashCommandItem;
  sections: PickerSection[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (item: PickerItem) => void;
  colors: ThemeColors;
}

type ModelListRow =
  | { kind: 'category'; title: string }
  | { kind: 'model'; item: PickerItem; flatIndex: number };

export function ModelsContent({
  command,
  sections,
  selectedIndex,
  onHighlight,
  onSelect,
  colors,
}: ModelsContentProps): React.JSX.Element {
  const { t } = useTranslation();

  const rows = useMemo((): ModelListRow[] => {
    const result: ModelListRow[] = [];
    let counter = 0;
    const showCategories = sections.filter((s) => s.items.length > 0).length > 1;
    for (const section of sections) {
      if (section.items.length === 0) continue;
      if (showCategories) {
        result.push({ kind: 'category', title: section.title });
      }
      for (const item of section.items) {
        result.push({ kind: 'model', item, flatIndex: counter++ });
      }
    }
    return result;
  }, [sections]);

  const renderRow = useCallback(({ item: row }: { item: ModelListRow }): React.JSX.Element => {
    if (row.kind === 'category') {
      return (
        <View style={paletteStyles.categoryRow}>
          <Text style={[paletteStyles.categoryLabel, { color: colors.mutedForeground }]}>
            {row.title}
          </Text>
        </View>
      );
    }
    return (
      <ModelRow
        item={row.item}
        currentIdx={row.flatIndex}
        selected={row.flatIndex === selectedIndex}
        onHighlight={onHighlight}
        onSelect={onSelect}
        colors={colors}
      />
    );
  }, [selectedIndex, onHighlight, onSelect, colors]);

  const keyExtractor = (row: ModelListRow): string => {
    if (row.kind === 'category') return `cat-${row.title}`;
    return row.item.key;
  };

  return (
    <>
      <View style={[paletteStyles.subHeader, { borderBottomColor: colors.border }]}>
        <Text style={[paletteStyles.subHeaderCmd, { color: colors.primary }]}>/{command.name}</Text>
        <Text style={[paletteStyles.subHeaderDesc, { color: colors.mutedForeground }]}>
          {translatedSlashDescription(t, command)}
        </Text>
      </View>
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
    </>
  );
}
