import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FontSize, Spacing } from '@/constants/theme';
import { formatCtxWindow } from '@/lib/formatTokens';
import type { SlashCommandItem } from '../slashCommands';
import type { PickerItem } from '../InputBarPickerModal';
import type { PaletteMode } from '../SlashCommandPalette';
import { translatedSlashDescription } from './shared';

export interface PaletteDetailFooterProps {
  mode: PaletteMode['kind'];
  selectedCommand: SlashCommandItem | null;
  selectedOption?: string;
  selectedModel?: PickerItem;
  borderColor: string;
  textColor: string;
  mutedColor: string;
}

export function PaletteDetailFooter({
  mode,
  selectedCommand,
  selectedOption,
  selectedModel,
  borderColor,
  textColor,
  mutedColor,
}: PaletteDetailFooterProps): React.JSX.Element {
  const { t } = useTranslation();

  if (mode === 'models') {
    if (!selectedModel) {
      return (
        <View style={[styles.row, { borderTopColor: borderColor }]}>
          <Text style={[styles.hint, { color: mutedColor }]}>{t('input.palette.tapAModel')}</Text>
        </View>
      );
    }
    const parts: string[] = [];
    if (selectedModel.subtitle) parts.push(selectedModel.subtitle);
    if (selectedModel.contextWindow) parts.push(formatCtxWindow(selectedModel.contextWindow));
    if (selectedModel.reasoning) parts.push(t('input.palette.reasoning'));
    return (
      <View style={[styles.row, { borderTopColor: borderColor }]}>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
          {selectedModel.title}
        </Text>
        {parts.length > 0 ? (
          <Text style={[styles.desc, { color: mutedColor }]} numberOfLines={1}>
            {parts.join(' · ')}
          </Text>
        ) : null}
      </View>
    );
  }

  if (mode === 'args') {
    if (!selectedCommand) {
      return (
        <View style={[styles.row, { borderTopColor: borderColor }]}>
          <Text style={[styles.hint, { color: mutedColor }]}>{t('input.palette.tapAnOption')}</Text>
        </View>
      );
    }
    const full = selectedOption
      ? `/${selectedCommand.name} ${selectedOption}`
      : `/${selectedCommand.name} …`;
    const cmdDesc = translatedSlashDescription(t, selectedCommand);
    return (
      <View style={[styles.row, { borderTopColor: borderColor }]}>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>{full}</Text>
        {!selectedOption ? (
          <Text style={[styles.desc, { color: mutedColor }]} numberOfLines={1}>
            {cmdDesc}
          </Text>
        ) : null}
      </View>
    );
  }

  // commands mode
  if (!selectedCommand) {
    return (
      <View style={[styles.row, { borderTopColor: borderColor }]}>
        <Text style={[styles.hint, { color: mutedColor }]}>{t('input.palette.tapToRun')}</Text>
      </View>
    );
  }

  const argHint = selectedCommand.args ? ` ${selectedCommand.args}` : '';
  const isInstant = Boolean(selectedCommand.executeLocal && !selectedCommand.argOptions?.length);
  const optionsStr = selectedCommand.argOptions?.length
    ? `  ·  ${selectedCommand.argOptions.join(', ')}`
    : '';
  const cmdDesc = translatedSlashDescription(t, selectedCommand);
  return (
    <View style={[styles.row, { borderTopColor: borderColor }]}>
      <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
        /{selectedCommand.name}{argHint}{isInstant ? `  ·  ${t('input.palette.instant')}` : ''}
      </Text>
      <Text style={[styles.desc, { color: mutedColor }]} numberOfLines={1}>
        {cmdDesc}{optionsStr}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  name: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  desc: {
    fontSize: FontSize.xs,
  },
  hint: {
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
});
