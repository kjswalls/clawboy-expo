import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { useSharedValue, useDerivedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, MessageSquare, Pin, Plus, X } from 'lucide-react-native';
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

  const pinnedExpandedSV = useSharedValue(true);
  const recentExpandedSV = useSharedValue(true);
  useEffect(() => { pinnedExpandedSV.value = pinnedExpanded; }, [pinnedExpanded, pinnedExpandedSV]);
  useEffect(() => { recentExpandedSV.value = recentExpanded; }, [recentExpanded, recentExpandedSV]);
  const pinnedRotation = useDerivedValue(() =>
    withTiming(pinnedExpandedSV.value ? 0 : -90, { duration: 200 }));
  const recentRotation = useDerivedValue(() =>
    withTiming(recentExpandedSV.value ? 0 : -90, { duration: 200 }));
  const pinnedChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pinnedRotation.value}deg` }],
  }));
  const recentChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${recentRotation.value}deg` }],
  }));
  const [clearing, setClearing] = useState(false);
  const [unpinningAll, setUnpinningAll] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'pinned' | 'recent' | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [unpinning, setUnpinning] = useState(false);

  const pinnedSessions = useMemo(() => sessions.filter((s) => s.isPinned), [sessions]);
  const recentSessions = useMemo(() => sessions.filter((s) => !s.isPinned), [sessions]);

  const isSelectable = useCallback((s: MockSession, target: 'pinned' | 'recent'): boolean => {
    if (s.id === activeSessionId || isMainSessionKey(s.id)) return false;
    return target === 'pinned' ? s.isPinned : !s.isPinned;
  }, [activeSessionId]);

  const enterSelection = useCallback((target: 'pinned' | 'recent', initialKey?: string): void => {
    setSelectionMode(target);
    setSelectedKeys(initialKey ? new Set([initialKey]) : new Set());
  }, []);

  const exitSelection = useCallback((): void => {
    setSelectionMode(null);
    setSelectedKeys(new Set());
  }, []);

  const toggle = useCallback((id: string): void => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Auto-exit if all selected keys disappear after a delete/unpin-driven refresh.
  useEffect(() => {
    if (!selectionMode || deleting || unpinning) return;
    const valid = new Set(
      selectionMode === 'pinned'
        ? sessions.filter((s) => s.isPinned).map((s) => s.id)
        : sessions.filter((s) => !s.isPinned).map((s) => s.id)
    );
    const stillValid = new Set([...selectedKeys].filter((k) => valid.has(k)));
    if (stillValid.size === 0 && selectedKeys.size > 0) {
      exitSelection();
    }
  }, [sessions, selectionMode, deleting, unpinning, selectedKeys, exitSelection]);

  const handleNewSession = useCallback((): void => {
    onNewSession();
    onOpenChange(false);
  }, [onNewSession, onOpenChange]);

  const showClear = selectionMode === null && isConnected && !!onClearRecent && recentSessions.filter(
    (s) => s.id !== activeSessionId
  ).length >= 1;

  const showSelect = selectionMode === null && isConnected && !!onDeleteSessions && recentSessions.some((s) => isSelectable(s, 'recent'));

  const showPinnedSelect = selectionMode === null && pinnedSessions.some((s) => isSelectable(s, 'pinned'));

  const showUnpinAll = selectionMode === null && pinnedSessions.filter((s) => s.id !== activeSessionId).length >= 1;

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

  const handleConfirmUnpinSelected = useCallback((): void => {
    if (selectedKeys.size === 0 || unpinning) return;
    const count = selectedKeys.size;
    Alert.alert(
      t('sidebar.unpinSelectedAlert.title'),
      t(count === 1 ? 'sidebar.unpinSelectedAlert.body_one' : 'sidebar.unpinSelectedAlert.body_other', { count }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sidebar.unpinBtn'),
          style: 'destructive',
          onPress: () => {
            setUnpinning(true);
            const keys = [...selectedKeys];
            keys.forEach((k) => {
              emitSessionPinned();
              onPinSession(k);
            });
            setUnpinning(false);
            exitSelection();
          },
        },
      ],
    );
  }, [t, selectedKeys, unpinning, onPinSession, exitSelection]);

  const handleConfirmUnpinAll = useCallback((): void => {
    if (unpinningAll) return;
    const eligible = pinnedSessions.filter((s) => s.id !== activeSessionId);
    if (eligible.length === 0) return;
    Alert.alert(
      t('sidebar.unpinAllAlert.title'),
      t(eligible.length === 1 ? 'sidebar.unpinAllAlert.body_one' : 'sidebar.unpinAllAlert.body_other', { count: eligible.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sidebar.unpinBtn'),
          style: 'destructive',
          onPress: () => {
            setUnpinningAll(true);
            eligible.forEach((s) => {
              emitSessionPinned();
              onPinSession(s.id);
            });
            setUnpinningAll(false);
          },
        },
      ],
    );
  }, [t, unpinningAll, pinnedSessions, activeSessionId, onPinSession]);

  const renderSessionRow = (session: MockSession, target: 'pinned' | 'recent') => {
    const sessionActivity = activityBySession?.[session.id];
    const isWorking =
      sessionActivity?.reason === 'awaiting' ||
      sessionActivity?.reason === 'streaming' ||
      sessionActivity?.reason === 'compacting';
    const sectionInSelection = selectionMode === target;
    return (
      <SessionRow
        key={session.id}
        session={session}
        isActive={session.id === activeSessionId}
        isOpen={isOpen}
        colors={colors}
        onSelect={() => { onSelectSession(session.id); onOpenChange(false); }}
        onPin={() => { emitSessionPinned(); onPinSession(session.id); }}
        onDelete={() => { emitSessionDeleted(); onDeleteSession(session.id); }}
        onReset={() => onResetSession(session.id)}
        onRename={(title) => { emitSessionRenamed(); onRenameSession(session.id, title); }}
        selectionMode={sectionInSelection}
        isSelected={sectionInSelection && selectedKeys.has(session.id)}
        isSelectable={isSelectable(session, target)}
        onToggleSelect={() => toggle(session.id)}
        onLongPress={() => enterSelection(target, session.id)}
        isWorking={isWorking}
      />
    );
  };

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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={pinnedSessions.length > 0 ? [0, 2] : [0]}
          contentContainerStyle={[
            styles.sectionsContainer,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          {/* Pinned header — sticky index 0 when pinned exists */}
          {pinnedSessions.length > 0 ? (
            <View style={[styles.sectionCardHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                {selectionMode === 'pinned' ? (
                  <>
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
                      onPress={handleConfirmUnpinSelected}
                      hitSlop={8}
                      disabled={selectedKeys.size === 0 || unpinning}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.clearBtn, { color: selectedKeys.size === 0 || unpinning ? colors.mutedForeground : colors.warning }]}>
                        {unpinning ? t('sidebar.unpinning') : t('sidebar.unpinBtn')}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => setPinnedExpanded((p) => !p)}
                      accessibilityRole="button"
                      accessibilityLabel={t('sidebar.pinned')}
                      accessibilityState={{ expanded: pinnedExpanded }}
                      style={({ pressed }) => [styles.sectionHeaderLeft, pressed && { opacity: 0.9 }]}
                    >
                      <Pin size={12} color={colors.mutedForeground} />
                      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('sidebar.pinned')}</Text>
                      <Animated.View style={pinnedChevronStyle}>
                        <ChevronDown size={16} color={colors.mutedForeground} />
                      </Animated.View>
                    </Pressable>
                    {showPinnedSelect ? (
                      <Pressable
                        onPress={() => enterSelection('pinned')}
                        hitSlop={8}
                        accessibilityLabel={t('sidebar.selectBtn')}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.clearBtn, { color: colors.accent }]}>
                          {t('sidebar.selectBtn')}
                        </Text>
                      </Pressable>
                    ) : null}
                    {showUnpinAll ? (
                      <Pressable
                        onPress={handleConfirmUnpinAll}
                        disabled={unpinningAll}
                        hitSlop={8}
                        accessibilityLabel={t('sidebar.unpinAllLabel')}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.clearBtn, { color: colors.mutedForeground }]}>
                          {unpinningAll ? t('sidebar.unpinning') : t('sidebar.unpinAll')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          ) : null}

          {/* Pinned body — index 1 when pinned exists */}
          {pinnedSessions.length > 0 ? (
            <View style={[styles.sectionCardBody, styles.pinnedBodyExtraGap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {pinnedExpanded && pinnedSessions.map((s) => renderSessionRow(s, 'pinned'))}
            </View>
          ) : null}

          {/* Recent header — sticky index 2 (with pinned) or 0 (without) */}
          <View style={[styles.sectionCardHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              {selectionMode === 'recent' ? (
              <>
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
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => setRecentExpanded((p) => !p)}
                  accessibilityRole="button"
                  accessibilityLabel={t('sidebar.recentSessions')}
                  accessibilityState={{ expanded: recentExpanded }}
                  style={({ pressed }) => [styles.sectionHeaderLeft, pressed && { opacity: 0.9 }]}
                >
                  <MessageSquare size={12} color={colors.mutedForeground} />
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {t('sidebar.recentSessions')}
                  </Text>
                  <Animated.View style={recentChevronStyle}>
                    <ChevronDown size={16} color={colors.mutedForeground} />
                  </Animated.View>
                </Pressable>
                {showSelect ? (
                  <Pressable
                    onPress={() => enterSelection('recent')}
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
              </>
            )}
            </View>
          </View>

          {/* Recent body — index 3 (with pinned) or 1 (without) */}
          <View style={[styles.sectionCardBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {recentExpanded && recentSessions.map((s) => renderSessionRow(s, 'recent'))}
            {recentExpanded && recentSessions.length === 0 && (
              <View style={styles.emptySmall}>
                <MessageSquare size={32} color={`${colors.mutedForeground}80`} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('sidebar.noRecent')}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </>
  );
}
