import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Edit2, Pin, RotateCcw, Trash2 } from 'lucide-react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';

import { BorderRadius } from '@/constants/theme';
import { useTokens } from '@/hooks/useTokens';
import type { TokenSet } from '@/hooks/useTokens';
import { isMainSessionKey } from '@/lib/openclaw/sessions';
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
  onReset: () => void;
  onRename: (newTitle: string) => void;
}

function createStyles(tk: TokenSet) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: tk.sp.sm,
      paddingHorizontal: tk.sp.md,
      paddingVertical: tk.sp.sm,
      borderRadius: BorderRadius.md,
      minHeight: tk.minTouch,
    },
    rowMain: {
      flex: 1,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    title: {
      flex: 1,
      fontSize: tk.fs.sm,
      fontWeight: '600' as const,
    },
    pinBadge: {
      marginTop: 2,
    },
    preview: {
      fontSize: tk.fs.xs,
      marginTop: 2,
      lineHeight: Math.round(tk.fs.xs * 1.4),
    },
    time: {
      fontSize: tk.fs.xs,
      marginLeft: 4,
    },
    titleInput: {
      fontSize: tk.fs.sm,
      fontWeight: '600' as const,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical: 2,
    },
    actionsRow: {
      flexDirection: 'row' as const,
      alignItems: 'stretch' as const,
      minHeight: tk.minTouch + 10,
      marginVertical: 3,
      marginRight: tk.sp.md,
      borderRadius: BorderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden' as const,
    },
    actionBtn: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: tk.sp.xs,
      paddingHorizontal: tk.sp.xs,
      paddingVertical: tk.sp.sm,
      width: Math.max(70, tk.minTouch + tk.sp.lg + tk.sp.sm),
    },
    actionLabel: {
      fontSize: Math.max(11, tk.fs.xs - 1),
      fontWeight: '600' as const,
      letterSpacing: 0.1,
    },
    actionDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch' as const,
    },
  });
}

function SessionRowInner({
  session,
  isActive,
  isOpen,
  colors,
  onSelect,
  onPin,
  onDelete,
  onReset,
  onRename,
}: SessionRowProps): React.JSX.Element {
  const swipeRef = useRef<SwipeableMethods>(null);
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const isMain = isMainSessionKey(session.id);

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
    Alert.alert(t('sidebar.session.deleteAlertTitle'), t('sidebar.session.deleteAlertBody', { title: session.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('sidebar.session.delete'),
        style: 'destructive',
        onPress: () => {
          onDelete();
        },
      },
    ]);
  }, [closeSwipe, onDelete, session.title, t]);

  const confirmReset = useCallback((): void => {
    closeSwipe();
    Alert.alert(t('sidebar.session.resetAlertTitle'), t('sidebar.session.resetAlertBody', { title: session.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('sidebar.session.reset'),
        style: 'destructive',
        onPress: () => {
          onReset();
        },
      },
    ]);
  }, [closeSwipe, onReset, session.title, t]);

  const renderRightActions = useCallback((): React.ReactElement => {
    return (
      <View style={[styles.actionsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => { closeSwipe(); onPin(); }}
          style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: colors.secondary }]}
          accessibilityLabel={session.isPinned ? t('sidebar.session.unpinLabel') : t('sidebar.session.pinLabel')}
        >
          <Pin size={tokens.iconSm} color={colors.warning} />
          <Text style={[styles.actionLabel, { color: colors.warning }]} numberOfLines={1}>
            {session.isPinned ? t('sidebar.session.unpin') : t('sidebar.session.pin')}
          </Text>
        </Pressable>

        <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

        <Pressable
          onPress={() => { closeSwipe(); setRenameValue(session.title); setIsRenaming(true); }}
          style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: colors.secondary }]}
          accessibilityLabel={t('sidebar.session.renameLabel')}
        >
          <Edit2 size={tokens.iconSm} color={colors.accent} />
          <Text style={[styles.actionLabel, { color: colors.accent }]} numberOfLines={1}>{t('sidebar.session.rename')}</Text>
        </Pressable>

        <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

        {isMain ? (
          <Pressable
            onPress={confirmReset}
            style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: colors.secondary }]}
            accessibilityLabel={t('sidebar.session.resetLabel')}
          >
            <RotateCcw size={tokens.iconSm} color={colors.destructive} />
            <Text style={[styles.actionLabel, { color: colors.destructive }]} numberOfLines={1}>{t('sidebar.session.reset')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={confirmDelete}
            style={({ pressed }) => [styles.actionBtn, pressed && { backgroundColor: colors.secondary }]}
            accessibilityLabel={t('sidebar.session.deleteLabel')}
          >
            <Trash2 size={tokens.iconSm} color={colors.destructive} />
            <Text style={[styles.actionLabel, { color: colors.destructive }]} numberOfLines={1}>{t('sidebar.session.delete')}</Text>
          </Pressable>
        )}
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
    confirmReset,
    isMain,
    onPin,
    session.isPinned,
    session.title,
    t,
  ]);

  const rowBg = isActive ? colors.secondary : colors.background;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1}
      overshootRight={false}
      rightThreshold={80}
      enableTrackpadTwoFingerGesture
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
        accessibilityLabel={`${session.title} — Open session`}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        <View style={styles.rowMain}>
          {isRenaming ? (
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              onBlur={commitRename}
              onSubmitEditing={commitRename}
              autoFocus
              style={[styles.titleInput, { color: colors.foreground, borderBottomColor: colors.accent }]}
              selectionColor={colors.accent}
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
    </ReanimatedSwipeable>
  );
}

export const SessionRow = memo(SessionRowInner);
