import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Menu, Plus, Settings2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { APP_NAME } from '@/lib/appMeta';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

interface ChatHeaderProps {
  onMenuPress: () => void;
  onSettingsPress: () => void;
  /** Starts a new chat session (same as sidebar "new session"). */
  onNewSessionPress?: () => void;
  title?: string;
  /** When provided, tapping the title enters inline rename mode. */
  onRenameTitle?: (newTitle: string) => void;
}

export function ChatHeader({
  onMenuPress,
  onSettingsPress,
  onNewSessionPress,
  title,
  onRenameTitle,
}: ChatHeaderProps): React.JSX.Element {
  const { colors } = useThemeContext();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const displayTitle = title ?? APP_NAME;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title ?? '');
  // Prevent double-fire from onBlur + onSubmitEditing firing in sequence.
  const committedRef = useRef(false);

  // Cancel any open editor when the session switches (title prop changes).
  useEffect(() => {
    setIsRenaming(false);
    committedRef.current = false;
  }, [title]);

  const handleTitlePress = useCallback((): void => {
    if (!title || !onRenameTitle) return;
    setRenameValue(title);
    committedRef.current = false;
    setIsRenaming(true);
  }, [title, onRenameTitle]);

  const commitRename = useCallback((): void => {
    if (committedRef.current) return;
    committedRef.current = true;
    setIsRenaming(false);
    const next = renameValue.trim();
    if (!next || next === title || !onRenameTitle) return;
    onRenameTitle(next);
  }, [renameValue, title, onRenameTitle]);

  const canRename = !!title && !!onRenameTitle;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.row}>
        <View style={styles.side}>
          <Pressable
            accessibilityLabel={t('chat.header.openMenu')}
            onPress={onMenuPress}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: pressed ? colors.secondary : 'transparent' },
            ]}
          >
            <Menu size={16} color={colors.mutedForeground} />
          </Pressable>
          {onNewSessionPress ? (
            <Pressable
              accessibilityLabel={t('chat.header.newSession')}
              accessibilityHint={t('chat.header.newSessionHint')}
              onPress={onNewSessionPress}
              style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: pressed ? colors.secondary : 'transparent' },
              ]}
            >
              <Plus size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.titleSlot}>
          {isRenaming ? (
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              onBlur={commitRename}
              onSubmitEditing={commitRename}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              style={[styles.titleInput, { color: colors.foreground }]}
              selectionColor={colors.accent}
            />
          ) : canRename ? (
            <Pressable
              onPress={handleTitlePress}
              accessibilityLabel={displayTitle}
              accessibilityHint={t('chat.header.renameHint')}
              accessibilityRole="button"
            >
              <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
                {displayTitle}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
              {displayTitle}
            </Text>
          )}
        </View>

        <View style={[styles.side, styles.sideEnd]}>
          <Pressable
            accessibilityLabel={t('chat.header.settings')}
            onPress={onSettingsPress}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: pressed ? colors.secondary : 'transparent' },
            ]}
          >
            <Settings2 size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  sideEnd: {
    justifyContent: 'flex-end',
  },
  titleSlot: {
    flex: 2,
    justifyContent: 'center',
    minWidth: 0,
  },
  iconBtn: {
    padding: 6,
    marginHorizontal: -6,
    borderRadius: BorderRadius.md,
  },
  title: {
    textAlign: 'center',
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  titleInput: {
    textAlign: 'center',
    fontSize: FontSize.sm,
    fontWeight: '500',
    paddingVertical: 2,
  },
});
