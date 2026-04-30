import React, { memo, useCallback, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Settings, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { ServerProfile, ThemeColors } from '@/types';

export type ProfileConnectionVisual = 'connected' | 'connecting' | 'error' | 'disconnected' | 'inactive';

export interface ServerProfileRowProps {
  profile: ServerProfile;
  isActive: boolean;
  connectionVisual: ProfileConnectionVisual;
  colors: ThemeColors;
  onSelect: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  /** When true (default), renders with individual border + radius. False = inside a grouped card. */
  grouped?: boolean;
}

function dotColor(visual: ProfileConnectionVisual, colors: ThemeColors): string {
  if (visual === 'connected') return colors.success;
  if (visual === 'connecting') return colors.warning;
  if (visual === 'error') return colors.destructive;
  if (visual === 'inactive') return colors.border;
  return colors.mutedForeground;
}

function ServerProfileRowInner({
  profile,
  isActive,
  connectionVisual,
  colors,
  onSelect,
  onDelete,
  onEdit,
  grouped = false,
}: ServerProfileRowProps): React.JSX.Element {
  const swipeRef = useRef<Swipeable>(null);
  const { t } = useTranslation();
  const closeSwipe = useCallback((): void => { swipeRef.current?.close(); }, []);

  const confirmDelete = useCallback((): void => {
    closeSwipe();
    Alert.alert(t('settings.server.removeAlertTitle'), t('settings.server.removeAlertBody', { name: profile.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.server.removeBtn'), style: 'destructive', onPress: onDelete },
    ]);
  }, [closeSwipe, onDelete, profile.name, t]);

  const renderRight = useCallback((): React.ReactElement => (
    <View style={styles.deleteWrap}>
      <Pressable
        onPress={confirmDelete}
        style={({ pressed }) => [
          styles.deleteBtn,
          { backgroundColor: colors.destructive },
          pressed && { opacity: 0.9 },
        ]}
        accessibilityLabel={t('settings.server.removeBtn')}
      >
        <Trash2 size={15} color={colors.destructiveForeground} />
        <Text style={[styles.deleteLabel, { color: colors.destructiveForeground }]}>{t('settings.server.removeBtn')}</Text>
      </Pressable>
    </View>
  ), [colors.destructive, colors.destructiveForeground, confirmDelete, t]);

  const urlDisplay = profile.url.replace(/^wss?:\/\//, '');
  const dot = dotColor(connectionVisual, colors);

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRight}
      overshootRight={false}
    >
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [
          styles.row,
          !grouped && {
            backgroundColor: colors.card,
            borderColor: isActive ? colors.primary : colors.border,
            borderWidth: 1,
            borderRadius: BorderRadius.lg,
          },
          grouped && { backgroundColor: colors.card },
          pressed && { opacity: 0.88 },
        ]}
      >
        {/* Connection / active dot (radio style) */}
        <View style={[
          styles.radioDot,
          isActive
            ? { backgroundColor: dot, borderColor: dot, borderWidth: 2 }
            : { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 2 },
        ]}>
          {isActive ? <Check size={9} color={colors.background} strokeWidth={3} /> : null}
        </View>

        {/* Name + URL */}
        <View style={styles.textCol}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.cardForeground }]} numberOfLines={1}>
              {profile.name}
            </Text>
            {isActive ? (
              <View style={[styles.activeBadge, { backgroundColor: `${colors.primary}18` }]}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: colors.primary }}>{t('settings.server.active')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.url, { color: colors.mutedForeground }]} numberOfLines={1}>
            {urlDisplay}
          </Text>
        </View>

        {/* Action icons */}
        <View style={styles.icons}>
          {onEdit ? (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onEdit(); }}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('settings.server.editConnection')}
            >
              <Settings size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); confirmDelete(); }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel={t('settings.server.removeBtn')}
          >
            <Trash2 size={15} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </Pressable>
    </Swipeable>
  );
}

export const ServerProfileRow = memo(ServerProfileRowInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  radioDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textCol: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: FontSize.sm, fontWeight: '500', flex: 1 },
  activeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  url: { fontSize: FontSize.xs, marginTop: 1 },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  iconBtn: { padding: 6, borderRadius: BorderRadius.md },
  deleteWrap: { justifyContent: 'center', marginLeft: Spacing.sm },
  deleteBtn: {
    height: '100%' as const,
    minWidth: 72,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    gap: 3,
  },
  deleteLabel: { fontSize: FontSize.xs, fontWeight: '600' },
});
