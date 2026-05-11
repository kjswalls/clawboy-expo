/**
 * BadgeGrid — FlatList grid with filter chips and badge detail modal.
 */

import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useTrophyShelfData, useBadgeState, type ShelfFilter } from '@/badges/hooks';
import type { BadgeDisplayRecord } from '@/badges/hooks';
import { BadgeCard } from './BadgeCard';
import { BadgeDetailModal } from './BadgeDetailModal';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

const FILTER_KEYS: { key: ShelfFilter; tKey: string }[] = [
  { key: 'all', tKey: 'badges.filters.all' },
  { key: 'earned', tKey: 'badges.filters.earned' },
  { key: 'in_progress', tKey: 'badges.filters.in_progress' },
  { key: 'locked', tKey: 'badges.filters.locked' },
  { key: 'founders', tKey: 'badges.filters.founders' },
];

const NUM_COLUMNS = 3;
const ITEM_GAP = 8;

export function BadgeGrid(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const badges = useTrophyShelfData(filter);
  const { state } = useBadgeState();
  const pinnedIds = state?.cosmetics.displayedBadges ?? [];

  const handlePress = (badge: BadgeDisplayRecord): void => {
    const idx = badges.findIndex((b) => b.id === badge.id);
    if (idx !== -1) setSelectedIndex(idx);
  };

  const renderBadge = ({ item }: { item: BadgeDisplayRecord }): React.JSX.Element => (
    <View style={styles.itemWrap}>
      <BadgeCard
        badge={item}
        isPinned={pinnedIds.includes(item.id)}
        onPress={handlePress}
      />
    </View>
  );

  const ListHeader = (
    <View style={styles.filterRow}>
      {FILTER_KEYS.map((f) => {
        const isActive = filter === f.key;
        return (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={({ pressed }) => [
              styles.filterChip,
              {
                borderColor: isActive ? colors.primary : `${colors.foreground}30`,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.filterLabel,
                { color: isActive ? colors.primary : colors.foreground },
              ]}
            >
              {t(f.tKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      <FlatList
        data={badges}
        keyExtractor={(item) => item.id}
        renderItem={renderBadge}
        numColumns={NUM_COLUMNS}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {t('badges.empty')}
            </Text>
          </View>
        }
      />
      <BadgeDetailModal
        badges={badges}
        index={selectedIndex}
        onIndexChange={setSelectedIndex}
        onClose={() => setSelectedIndex(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing['2xl'],
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: Spacing.lg,
  },
  filterChip: {
    flexShrink: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  row: {
    gap: ITEM_GAP,
    marginBottom: ITEM_GAP,
  },
  itemWrap: {
    flex: 1,
  },
  empty: {
    padding: Spacing['2xl'],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
  },
});
