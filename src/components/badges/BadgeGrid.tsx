/**
 * BadgeGrid — FlatList grid with filter chips and badge detail modal.
 */

import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useTrophyShelfData, type ShelfFilter } from '@/badges/hooks';
import type { BadgeDisplayRecord } from '@/badges/hooks';
import { BadgeCard } from './BadgeCard';
import { BadgeDetailModal } from './BadgeDetailModal';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

const FILTERS: { key: ShelfFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'earned', label: 'Earned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'locked', label: 'Locked' },
  { key: 'founders', label: 'Founders' },
];

const NUM_COLUMNS = 3;
const ITEM_GAP = 8;

export function BadgeGrid(): React.JSX.Element {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [selectedBadge, setSelectedBadge] = useState<BadgeDisplayRecord | null>(null);
  const badges = useTrophyShelfData(filter);

  const renderBadge = ({ item }: { item: BadgeDisplayRecord }): React.JSX.Element => (
    <View style={styles.itemWrap}>
      <BadgeCard badge={item} onPress={setSelectedBadge} />
    </View>
  );

  const ListHeader = (
    <View style={styles.filterRow}>
      {FILTERS.map((f) => {
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
              {f.label}
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
              No badges here yet.
            </Text>
          </View>
        }
      />
      <BadgeDetailModal
        badge={selectedBadge}
        onClose={() => setSelectedBadge(null)}
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
