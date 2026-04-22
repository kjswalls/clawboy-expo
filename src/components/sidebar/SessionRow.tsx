import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Edit2, Pin, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { MockSession, ThemeColors } from '@/types';
import { formatSessionListTime } from '@/utils/formatting';

export interface SessionRowProps {
  session: MockSession;
  isActive: boolean;
  isOpen: boolean;
  colors: ThemeColors;
  onSelect: () => void;
  onPin: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

function SessionRowInner({
  session,
  isActive,
  isOpen,
  colors,
  onSelect,
  onPin,
  onDelete,
  onRename,
}: SessionRowProps): React.JSX.Element {
  const swipeRef = useRef<Swipeable>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);

  // Close swipe actions whenever the sidebar opens so nothing is pre-revealed.
  useEffect(() => {
    if (isOpen) {
      swipeRef.current?.close();
    }
  }, [isOpen]);

  const closeSwipe = useCallback((): void => {
    swipeRef.current?.close();
  }, []);

  const commitRename = useCallback((): void => {
    const next = renameValue.trim();
    if (next && next !== session.title) {
      onRename(next);
    } else {
      setRenameValue(session.title);
    }
    setIsRenaming(false);
  }, [onRename, renameValue, session.title]);

  const confirmDelete = useCallback((): void => {
    closeSwipe();
    Alert.alert('Delete session', `Remove "${session.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete();
        },
      },
    ]);
  }, [closeSwipe, onDelete, session.title]);

  const renderRightActions = useCallback((): React.ReactElement => {
    return (
      <View style={[styles.actionsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => { closeSwipe(); onPin(); }}
          style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: colors.secondary }]}
          accessibilityLabel={session.isPinned ? 'Unpin session' : 'Pin session'}
        >
          <Pin size={15} color={colors.warning} />
          <Text style={[styles.actionLabel, { color: colors.warning }]}>
            {session.isPinned ? 'Unpin' : 'Pin'}
          </Text>
        </Pressable>

        <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

        <Pressable
          onPress={() => { closeSwipe(); setRenameValue(session.title); setIsRenaming(true); }}
          style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: colors.secondary }]}
          accessibilityLabel="Rename session"
        >
          <Edit2 size={15} color={colors.accentBlue} />
          <Text style={[styles.actionLabel, { color: colors.accentBlue }]}>Rename</Text>
        </Pressable>

        <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

        <Pressable
          onPress={confirmDelete}
          style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: colors.secondary }]}
          accessibilityLabel="Delete session"
        >
          <Trash2 size={15} color={colors.destructive} />
          <Text style={[styles.actionLabel, { color: colors.destructive }]}>Delete</Text>
        </Pressable>
      </View>
    );
  }, [
    closeSwipe,
    colors.accentBlue,
    colors.border,
    colors.card,
    colors.destructive,
    colors.secondary,
    colors.warning,
    confirmDelete,
    onPin,
    session.isPinned,
    session.title,
  ]);

  const rowBg = isActive ? colors.secondary : 'transparent';

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootRight={false}
      renderRightActions={renderRightActions}
      enabled={!isRenaming}
    >
      <Pressable
        onPress={() => {
          if (!isRenaming) onSelect();
        }}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: rowBg },
          !isActive && pressed && { backgroundColor: colors.secondary },
        ]}
      >
        <View style={styles.rowMain}>
          {isRenaming ? (
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              onBlur={commitRename}
              onSubmitEditing={commitRename}
              autoFocus
              style={[styles.titleInput, { color: colors.foreground, borderBottomColor: colors.primary }]}
              selectionColor={colors.primary}
            />
          ) : (
            <>
              <View style={styles.titleRow}>
                <Text
                  style={[styles.title, { color: isActive ? colors.foreground : `${colors.foreground}CC` }]}
                  numberOfLines={1}
                >
                  {session.title}
                </Text>
                {session.isPinned && (
                  <Pin size={12} color={colors.mutedForeground} style={styles.pinBadge} />
                )}
              </View>
              {session.preview.length > 0 ? (
                <Text style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {session.preview}
                </Text>
              ) : null}
            </>
          )}
        </View>
        {!isRenaming ? (
          <Text style={[styles.time, { color: colors.mutedForeground }]}>
            {formatSessionListTime(session.updatedAt)}
          </Text>
        ) : null}
      </Pressable>
    </Swipeable>
  );
}

export const SessionRow = memo(SessionRowInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  pinBadge: {
    marginTop: 2,
  },
  preview: {
    fontSize: FontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  time: {
    fontSize: FontSize.xs,
    marginLeft: 4,
  },
  titleInput: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginVertical: 3,
    marginRight: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    width: 60,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
});
