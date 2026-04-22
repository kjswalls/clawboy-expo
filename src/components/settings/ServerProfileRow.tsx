import React, { memo, useCallback, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ServerProfile, ThemeColors } from '@/types';
import { truncateMiddle } from '@/utils/gatewayUrl';

export type ProfileConnectionVisual = 'connected' | 'connecting' | 'error' | 'disconnected' | 'inactive';

export interface ServerProfileRowProps {
  profile: ServerProfile;
  isActive: boolean;
  connectionVisual: ProfileConnectionVisual;
  colors: ThemeColors;
  onSelect: () => void;
  onDelete: () => void;
  swipeEnabled?: boolean;
}

function dotFor(visual: ProfileConnectionVisual, colors: ThemeColors): { bg: string; border?: string } {
  if (visual === 'inactive') {
    return { bg: colors.mutedForeground, border: colors.border };
  }
  if (visual === 'connected') {
    return { bg: colors.success };
  }
  if (visual === 'connecting') {
    return { bg: colors.warning };
  }
  if (visual === 'error') {
    return { bg: colors.destructive };
  }
  return { bg: colors.mutedForeground };
}

function ServerProfileRowInner({
  profile,
  isActive,
  connectionVisual,
  colors,
  onSelect,
  onDelete,
  swipeEnabled = true,
}: ServerProfileRowProps): React.JSX.Element {
  const swipeRef = useRef<Swipeable>(null);
  const closeSwipe = useCallback((): void => {
    swipeRef.current?.close();
  }, []);

  const confirmDelete = useCallback((): void => {
    closeSwipe();
    Alert.alert('Remove server', `Remove “${profile.name}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onDelete },
    ]);
  }, [closeSwipe, onDelete, profile.name]);

  const renderRight = useCallback((): React.ReactElement => {
    return (
      <View style={styles.deleteWrap}>
        <Pressable
          onPress={confirmDelete}
          style={({ pressed }) => [styles.deleteBtn, { backgroundColor: colors.destructive }, pressed && { opacity: 0.9 }]}
          accessibilityLabel="Delete server profile"
        >
          <Trash2 size={16} color={colors.destructiveForeground} />
          <Text style={[styles.deleteLabel, { color: colors.destructiveForeground }]}>Delete</Text>
        </Pressable>
      </View>
    );
  }, [colors.destructive, colors.destructiveForeground, confirmDelete]);

  const d = dotFor(connectionVisual, colors);
  const urlShort = truncateMiddle(profile.url.replace(/^wss?:\/\//, ''), 36);

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRight}
      overshootRight={false}
      enabled={swipeEnabled}
    >
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.card,
            borderColor: isActive ? colors.primary : colors.border,
            borderWidth: 1,
          },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View
          style={[
            styles.dot,
            { backgroundColor: d.bg, borderWidth: d.border ? 1 : 0, borderColor: d.border },
          ]}
        />
        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: colors.cardForeground }]} numberOfLines={1}>
              {profile.name}
            </Text>
            {isActive ? <Check size={16} color={colors.primary} /> : null}
          </View>
          <Text style={[styles.url, { color: colors.mutedForeground }]} numberOfLines={1}>
            {urlShort}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Pressable>
    </Swipeable>
  );
}

export const ServerProfileRow = memo(ServerProfileRowInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  url: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  deleteWrap: {
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  deleteBtn: {
    height: '100%' as const,
    minWidth: 72,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  deleteLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
});
