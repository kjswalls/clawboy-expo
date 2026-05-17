import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, MessageSquare, Pin, Plus, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { isMainSessionKey } from '@/lib/openclaw/sessions';
import {
  emitSessionPinned,
  emitSessionDeleted,
  emitSessionRenamed,
  emitSessionsBulkCleared,
} from '@/badges/events';

import type { MockSession, ThemeColors } from '@/types';
import type { SessionActivity } from '@/types/chat-ui';
import { useTokens } from '@/hooks/useTokens';
import { SessionRow } from './SessionRow';
import { SessionSkeleton } from './SessionSkeleton';
import { createSessionSidebarStyles } from './sessionSidebarStyles';

export interface SessionSidebarListProps {
  sessions: MockSession[];
  activeSessionId: string | null;
  colors: ThemeColors;
  isOpen: boolean;
  isLoading?: boolean;
  isConnected?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onPinSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onResetSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onClearRecent?: () => Promise<{ deleted: number; skipped: number; failed: number }>;
  onDeleteSessions?: (keys: string[]) => Promise<{ deleted: number; skipped: number; failed: number }>;
  activityBySession?: Record<string, SessionActivity | null>;
}

type SectionHeaderItem = {
  type: 'section-header';
  section: 'pinned' | 'recent';
  count: number;
  expanded: boolean;
};

type SessionItem = {
  type: 'session';
  session: MockSession;
};

type ListItem = SectionHeaderItem | SessionItem;

export function SessionSidebarList({
  sessions,
  activeSessionId,
  colors,
  isOpen,
  isLoading = false,
  isConnected = false,
  onOpenChange,
  onSelectSession,
  onNewSession,
  onPinSession,
  onDeleteSession,
  onResetSession,
  onRenameSession,
  onClearRecent,
  onDeleteSessions,
  activityBySession,
}: SessionSidebarListProps): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const listTokens = useTokens();
  const styles = useMemo(() => createSessionSidebarStyles(listTokens), [listTokens]);
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);

  const pinnedSessions = useMemo(() => sessions.filter((s) => s.isPinned), [sessions]);
  const recentSessions = useMemo(() => sessions.filter((s) => !s.isPinned), [sessions]);

  const isSelectable = useCallback((s: MockSession): boolean => {
    return !s.isPinned && s.id !== activeSessionId && !isMainSessionKey(s.id);
  }, [activeSessionId]);

  const enterSelection = useCallback((initialKey?: string): void => {
    setSelectionMode(true);
    setSelectedKeys(initialKey ? new Set([initialKey]) : new Set());
  }, []);

  const exitSelection = useCallback((): void => {
    setSelectionMode(false);
    setSelectedKeys(new Set());
  }, []);

  const toggle = useCallback((id: string): void => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Auto-exit if all selected keys disappear after a delete-driven refresh.
  useEffect(() => {
    if (!selectionMode || deleting) return;
    const sessionIds = new Set(sessions.map((s) => s.id));
    const stillValid = new Set([...selectedKeys].filter((k) => sessionIds.has(k)));
    if (stillValid.size === 0 && selectedKeys.size > 0) {
      exitSelection();
    }
  }, [sessions, selectionMode, deleting, selectedKeys, exitSelection]);

  const handleNewSession = useCallback((): void => {
    onNewSession();
    onOpenChange(false);
  }, [onNewSession, onOpenChange]);

  const showClear = !selectionMode && isConnected && !!onClearRecent && recentSessions.filter(
    (s) => s.id !== activeSessionId
  ).length >= 1;

  const showSelect = !selectionMode && isConnected && !!onDeleteSessions && recentSessions.some(isSelectable);

  const handleConfirmClear = useCallback((): void => {
    if (!onClearRecent || clearing) return;
    const eligible = recentSessions.filter((s) => s.id !== activeSessionId).length;
    Alert.alert(
      t('sidebar.clearAlert.title'),
      t(eligible === 1 ? 'sidebar.clearAlert.body_one' : 'sidebar.clearAlert.body_other', { count: eligible }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sidebar.clearBtn'),
          style: 'destructive',
          onPress: () => {
            setClearing(true);
            emitSessionsBulkCleared();
            void onClearRecent().finally(() => setClearing(false));
          },
        },
      ],
    );
  }, [t, onClearRecent, clearing, recentSessions, activeSessionId]);

  const handleConfirmDeleteSelected = useCallback((): void => {
    if (selectedKeys.size === 0 || deleting || !onDeleteSessions) return;
    const count = selectedKeys.size;
    Alert.alert(
      t('sidebar.deleteSelectedAlert.title'),
      t(count === 1 ? 'sidebar.deleteSelectedAlert.body_one' : 'sidebar.deleteSelectedAlert.body_other', { count }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            [...selectedKeys].forEach(() => emitSessionDeleted());
            void onDeleteSessions([...selectedKeys]).finally(() => {
              setDeleting(false);
              exitSelection();
            });
          },
        },
      ],
    );
  }, [t, selectedKeys, deleting, onDeleteSessions, exitSelection]);

  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = [];

    if (pinnedSessions.length > 0) {
      items.push({ type: 'section-header', section: 'pinned', count: pinnedSessions.length, expanded: pinnedExpanded });
      if (pinnedExpanded) {
        for (const session of pinnedSessions) {
          items.push({ type: 'session', session });
        }
      }
    }

    items.push({ type: 'section-header', section: 'recent', count: recentSessions.length, expanded: recentExpanded });
    if (recentExpanded) {
      for (const session of recentSessions) {
        items.push({ type: 'session', session });
      }
    }

    return items;
  }, [pinnedSessions, recentSessions, pinnedExpanded, recentExpanded]);

  const renderItem = useCallback(({ item }: { item: ListItem }): React.JSX.Element | null => {
    if (item.type === 'section-header') {
      if (item.section === 'pinned') {
        return (
          <Pressable
            onPress={() => setPinnedExpanded((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={t('sidebar.pinned')}
            accessibilityState={{ expanded: item.expanded }}
            style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.sectionHeaderLeft}>
              <Pin size={12} color={colors.mutedForeground} />
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('sidebar.pinned')}</Text>
            </View>
            <ChevronRight
              size={16}
              color={colors.mutedForeground}
              style={{ transform: [{ rotate: item.expanded ? '90deg' : '0deg' }] }}
            />
          </Pressable>
        );
      }
      // recent
      return (
        <View>
          <View style={styles.sectionHeader}>
            <Pressable
              onPress={() => setRecentExpanded((p) => !p)}
              accessibilityRole="button"
              accessibilityLabel={t('sidebar.recentSessions')}
              accessibilityState={{ expanded: item.expanded }}
              style={({ pressed }) => [styles.sectionHeaderLeft, pressed && { opacity: 0.9 }]}
            >
              <MessageSquare size={12} color={colors.mutedForeground} />
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {t('sidebar.recentSessions')}
              </Text>
              <ChevronDown
                size={16}
                color={colors.mutedForeground}
                style={{ transform: [{ rotate: item.expanded ? '0deg' : '-90deg' }] }}
              />
            </Pressable>
            {showSelect ? (
              <Pressable
                onPress={() => enterSelection()}
                hitSlop={8}
                accessibilityLabel={t('sidebar.selectBtn')}
                accessibilityRole="button"
              >
                <Text style={[styles.clearBtn, { color: colors.accent }]}>
                  {t('sidebar.selectBtn')}
                </Text>
              </Pressable>
            ) : null}
            {showClear ? (
              <Pressable
                onPress={handleConfirmClear}
                disabled={clearing}
                hitSlop={8}
                accessibilityLabel={t('sidebar.clearAllLabel')}
                accessibilityRole="button"
              >
                <Text style={[styles.clearBtn, { color: clearing ? colors.mutedForeground : '#ef4444' }]}>
                  {clearing ? t('sidebar.clearing') : t('sidebar.clearBtn')}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {selectionMode ? (
            <View style={styles.selectionBar}>
              <Pressable
                onPress={exitSelection}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={[styles.clearBtn, { color: colors.accent }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: 'center', flex: 1 }]}>
                {t(selectedKeys.size === 1 ? 'sidebar.selectionCount_one' : 'sidebar.selectionCount_other', { count: selectedKeys.size })}
              </Text>
              <Pressable
                onPress={handleConfirmDeleteSelected}
                hitSlop={8}
                disabled={selectedKeys.size === 0 || deleting}
                accessibilityRole="button"
              >
                <Text style={[styles.clearBtn, { color: selectedKeys.size === 0 || deleting ? colors.mutedForeground : '#ef4444' }]}>
                  {deleting ? t('sidebar.deleting') : t('common.delete')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      );
    }

    // session
    const { session } = item;
    const selectable = isSelectable(session);
    const sessionActivity = activityBySession?.[session.id];
    const isWorking =
      sessionActivity?.reason === 'awaiting' ||
      sessionActivity?.reason === 'streaming' ||
      sessionActivity?.reason === 'compacting';
    return (
      <SessionRow
        session={session}
        isActive={session.id === activeSessionId}
        isOpen={isOpen}
        colors={colors}
        onSelect={() => {
          onSelectSession(session.id);
          onOpenChange(false);
        }}
        onPin={() => { emitSessionPinned(); onPinSession(session.id); }}
        onDelete={() => { emitSessionDeleted(); onDeleteSession(session.id); }}
        onReset={() => onResetSession(session.id)}
        onRename={(title) => { emitSessionRenamed(); onRenameSession(session.id, title); }}
        selectionMode={selectionMode}
        isSelected={selectedKeys.has(session.id)}
        isSelectable={selectable}
        onToggleSelect={() => toggle(session.id)}
        onLongPress={() => enterSelection(session.id)}
        isWorking={isWorking}
      />
    );
  }, [
    styles, colors, t, isOpen, activeSessionId, showClear, clearing,
    showSelect, selectionMode, selectedKeys, isSelectable, toggle, enterSelection,
    onSelectSession, onOpenChange, onPinSession, onDeleteSession, onResetSession, onRenameSession,
    handleConfirmClear, handleConfirmDeleteSelected, exitSelection, deleting, activityBySession,
  ]);

  const keyExtractor = useCallback((item: ListItem): string => {
    if (item.type === 'section-header') return `header-${item.section}`;
    return item.session.id;
  }, []);

  const getItemType = useCallback((item: ListItem): string => item.type, []);

  const emptySection = recentExpanded && recentSessions.length === 0 && !isLoading ? (
    <View style={styles.emptySmall}>
      <MessageSquare size={32} color={`${colors.mutedForeground}80`} />
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('sidebar.noRecent')}</Text>
    </View>
  ) : null;

  return (
    <>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('sidebar.title')}</Text>
        <Pressable
          onPress={() => onOpenChange(false)}
          accessibilityLabel={t('sidebar.close')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.iconHit, pressed && { backgroundColor: colors.secondary }]}
        >
          <X size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.newSessionWrap}>
        <Pressable
          onPress={handleNewSession}
          accessibilityLabel={t('sidebar.newSession')}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.newSessionBtn,
            {
              backgroundColor: colors.secondary,
              borderColor: colors.border,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <Plus size={12} color={colors.primary} />
          <Text style={[styles.newSessionText, { color: colors.foreground }]}>{t('sidebar.newSession')}</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <SessionSkeleton colors={colors} />
      ) : sessions.length === 0 ? (
        <View style={styles.emptyBig}>
          <MessageSquare size={32} color={`${colors.mutedForeground}80`} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t('sidebar.emptyState')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          ListFooterComponent={emptySection}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ disabled: true }}
        />
      )}
    </>
  );
}
