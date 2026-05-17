import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { LEVEL_FILTERS, levelDotColor, type LevelFilter } from './logDisplayHelpers';

interface LogFilterBarProps {
  levelFilter: LevelFilter;
  onSetLevelFilter: (level: LevelFilter) => void;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function LogFilterBar({
  levelFilter,
  onSetLevelFilter,
  colors,
  t,
}: LogFilterBarProps): React.JSX.Element {
  return (
    <View style={[filterStyles.filterBar, { borderBottomColor: colors.border }]}>
      <View style={filterStyles.chips}>
        {LEVEL_FILTERS.map((lvl) => {
          const active = levelFilter === lvl;
          return (
            <Pressable
              key={lvl}
              onPress={() => { onSetLevelFilter(lvl); }}
              style={({ pressed }) => [
                filterStyles.chip,
                {
                  backgroundColor: active ? `${colors.primary}22` : 'transparent',
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              {lvl !== 'all' ? (
                <View style={[filterStyles.levelDot, { backgroundColor: levelDotColor(lvl, colors) }]} />
              ) : null}
              <Text
                style={[
                  filterStyles.chipText,
                  { color: active ? colors.primary : colors.mutedForeground },
                ]}
              >
                {t(`gatewayLogs.filters.${lvl}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const filterStyles = StyleSheet.create({
  filterBar: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
});
