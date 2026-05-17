import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowDown, ArrowUp, Globe, RefreshCw, Trash2, WrapText } from 'lucide-react-native';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import type { LogTimeFormat } from '@/lib/formatLogTimestamp';
import type { SortOrder } from './logDisplayHelpers';

interface LogToolbarProps {
  searchRaw: string;
  onSearchChange: (text: string) => void;
  wrap: boolean;
  onToggleWrap: () => void;
  sortOrder: SortOrder;
  onToggleSortOrder: () => void;
  tzMode: LogTimeFormat;
  onToggleTzMode: () => void;
  onRefresh: () => void;
  onClear: () => void;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function LogToolbar({
  searchRaw,
  onSearchChange,
  wrap,
  onToggleWrap,
  sortOrder,
  onToggleSortOrder,
  tzMode,
  onToggleTzMode,
  onRefresh,
  onClear,
  colors,
  t,
}: LogToolbarProps): React.JSX.Element {
  return (
    <View style={[toolbarStyles.toolbar, { borderBottomColor: colors.border }]}>
      <TextInput
        style={[
          toolbarStyles.searchInput,
          {
            backgroundColor: colors.secondary,
            color: colors.foreground,
            borderColor: colors.border,
          },
        ]}
        value={searchRaw}
        onChangeText={onSearchChange}
        placeholder={t('gatewayLogs.searchPlaceholder')}
        placeholderTextColor={colors.mutedForeground}
        clearButtonMode="while-editing"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      <Pressable
        onPress={onToggleWrap}
        style={({ pressed }) => [
          toolbarStyles.toolbarBtn,
          { borderColor: wrap ? colors.primary : colors.border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={wrap ? t('gatewayLogs.wrapDisable') : t('gatewayLogs.wrapEnable')}
      >
        <WrapText size={14} color={wrap ? colors.primary : colors.mutedForeground} />
      </Pressable>

      <Pressable
        onPress={onToggleSortOrder}
        style={({ pressed }) => [
          toolbarStyles.toolbarBtnWide,
          { borderColor: sortOrder === 'newest-top' ? colors.primary : colors.border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={
          sortOrder === 'newest-bottom'
            ? t('gatewayLogs.sortNewestBottom')
            : t('gatewayLogs.sortNewestTop')
        }
      >
        {sortOrder === 'newest-bottom'
          ? <ArrowDown size={12} color={colors.mutedForeground} />
          : <ArrowUp size={12} color={colors.primary} />
        }
        <Text style={[toolbarStyles.tzLabel, { color: sortOrder === 'newest-top' ? colors.primary : colors.mutedForeground }]}>
          {t('gatewayLogs.sortNewest')}
        </Text>
      </Pressable>

      <Pressable
        onPress={onToggleTzMode}
        style={({ pressed }) => [
          toolbarStyles.toolbarBtnWide,
          { borderColor: tzMode === 'utc' ? colors.primary : colors.border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={tzMode === 'utc' ? t('gatewayLogs.tzSwitchLocal') : t('gatewayLogs.tzSwitchUtc')}
      >
        <Globe size={12} color={tzMode === 'utc' ? colors.primary : colors.mutedForeground} />
        <Text style={[toolbarStyles.tzLabel, { color: tzMode === 'utc' ? colors.primary : colors.mutedForeground }]}>
          {tzMode === 'utc' ? t('gatewayLogs.tzUtc') : t('gatewayLogs.tzLocal')}
        </Text>
      </Pressable>

      <Pressable
        onPress={onRefresh}
        style={({ pressed }) => [
          toolbarStyles.toolbarBtn,
          { borderColor: colors.border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={t('gatewayLogs.refreshLogs')}
      >
        <RefreshCw size={14} color={colors.mutedForeground} />
      </Pressable>

      <Pressable
        onPress={onClear}
        style={({ pressed }) => [
          toolbarStyles.toolbarBtn,
          { borderColor: colors.border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={t('gatewayLogs.clearBuffer')}
      >
        <Trash2 size={14} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const toolbarStyles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    height: 32,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.xs,
  },
  toolbarBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  toolbarBtnWide: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  tzLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
});
