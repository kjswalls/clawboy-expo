/**
 * Shared types, styles, and utilities for the SlashCommandPalette sub-components.
 */

import { Platform, StyleSheet } from 'react-native';
import i18n from 'i18next';
import type { TFunction } from 'i18next';
import { FontSize, Spacing } from '@/constants/theme';
import { useThemeContext } from '@/contexts/ThemeContext';
import type { SlashCommandItem } from '../slashCommands';

export type ThemeColors = ReturnType<typeof useThemeContext>['colors'];

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function translatedSlashDescription(t: TFunction, cmd: SlashCommandItem): string {
  const key = cmd.name.replace(/[:.-]/gu, '_');
  const fullKey = `input.slashCommands.${key}.description`;
  return i18n.exists(fullKey) ? t(fullKey) : cmd.description;
}

export const paletteStyles = StyleSheet.create({
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
    fontSize: 11,
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
  subHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subHeaderCmd: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  subHeaderDesc: {
    fontSize: FontSize.xs,
    fontWeight: '400',
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
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  modelRowTall: {
    alignItems: 'flex-start',
    paddingTop: 10,
    paddingBottom: 10,
  },
  modelDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelDotLetter: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modelTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  modelName: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  modelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  modelSubtitle: {
    fontSize: 11,
    opacity: 0.7,
    flexShrink: 1,
  },
  modelMetaDivider: {
    fontSize: 11,
    opacity: 0.6,
  },
  modelCtx: {
    fontSize: 11,
    opacity: 0.75,
  },
  modelBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  modelBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
