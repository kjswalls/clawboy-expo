import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, MessageSquare, Pin, Plus, X } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import type { MockSession, ThemeColors } from '@/types';
import { ShimmerLine } from '@/components/common/ShimmerLine';
import { SessionRow } from './SessionRow';
import { sessionSidebarStyles as styles } from './sessionSidebarStyles';

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
  onRenameSession: (id: string, newTitle: string) => void;
  onClearRecent?: () => Promise<{ deleted: number; skipped: number; failed: number }>;
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
  onRenameSession,
  onClearRecent,
}: SessionSidebarListProps): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);
  const [clearing, setClearing] = useState(false);

  const pinnedProgress = useSharedValue(1);
  const recentProgress = useSharedValue(1);

  useEffect(() => {
    pinnedProgress.value = withTiming(pinnedExpanded ? 1 : 0, { duration: 240 });
  }, [pinnedExpanded, pinnedProgress]);

  useEffect(() => {
    recentProgress.value = withTiming(recentExpanded ? 1 : 0, { duration: 240 });
  }, [recentExpanded, recentProgress]);

  const pinnedChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pinnedProgress.value * 90}deg` }],
  }));

  const recentChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-90 + recentProgress.value * 90}deg` }],
  }));

  const pinnedBodyStyle = useAnimatedStyle(() => ({
    maxHeight: pinnedProgress.value * 1200,
    opacity: pinnedProgress.value > 0.02 ? 1 : 0,
    overflow: 'hidden',
  }));

  const recentBodyStyle = useAnimatedStyle(() => ({
    maxHeight: recentProgress.value * 1200,
    opacity: recentProgress.value > 0.02 ? 1 : 0,
    overflow: 'hidden',
  }));

  const pinnedSessions = useMemo(() => sessions.filter((s) => s.isPinned), [sessions]);
  const recentSessions = useMemo(() => sessions.filter((s) => !s.isPinned), [sessions]);

  const handleNewSession = (): void => {
    onNewSession();
    onOpenChange(false);
  };

  const showClear = isConnected && !!onClearRecent && recentSessions.filter(
    (s) => s.id !== activeSessionId
  ).length >= 1;

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
            void onClearRecent().finally(() => setClearing(false));
          },
        },
      ],
    );
  }, [t, onClearRecent, clearing, recentSessions, activeSessionId]);

  return (
    <>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('sidebar.title')}</Text>
        <Pressable
          onPress={() => onOpenChange(false)}
          accessibilityLabel={t('sidebar.close')}
          style={({ pressed }) => [styles.iconHit, pressed && { backgroundColor: colors.secondary }]}
        >
          <X size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.newSessionWrap}>
        <Pressable
          onPress={handleNewSession}
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
          <>
            {pinnedSessions.length > 0 ? (
              <View style={styles.section}>
                <Pressable
                  onPress={() => setPinnedExpanded((p) => !p)}
                  style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.9 }]}
                >
                  <View style={styles.sectionHeaderLeft}>
                    <Pin size={12} color={colors.mutedForeground} />
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('sidebar.pinned')}</Text>
                  </View>
                  <Animated.View style={pinnedChevronStyle}>
                    <ChevronRight size={16} color={colors.mutedForeground} />
                  </Animated.View>
                </Pressable>
                <Animated.View style={pinnedBodyStyle}>
                  {pinnedSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      isOpen={isOpen}
                      colors={colors}
                      onSelect={() => {
                        onSelectSession(session.id);
                        onOpenChange(false);
                      }}
                      onPin={() => onPinSession(session.id)}
                      onDelete={() => onDeleteSession(session.id)}
                      onRename={(title) => onRenameSession(session.id, title)}
                    />
                  ))}
                </Animated.View>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Pressable
                  onPress={() => setRecentExpanded((p) => !p)}
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
              <Animated.View style={recentBodyStyle}>
                {recentSessions.length > 0 ? (
                  recentSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      isOpen={isOpen}
                      colors={colors}
                      onSelect={() => {
                        onSelectSession(session.id);
                        onOpenChange(false);
                      }}
                      onPin={() => onPinSession(session.id)}
                      onDelete={() => onDeleteSession(session.id)}
                      onRename={(title) => onRenameSession(session.id, title)}
                    />
                  ))
                ) : (
                  <View style={styles.emptySmall}>
                    <MessageSquare size={32} color={`${colors.mutedForeground}80`} />
                    <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('sidebar.noRecent')}</Text>
                  </View>
                )}
              </Animated.View>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const SKELETON_WIDTHS = [180, 140, 200, 120] as const;

function SessionSkeleton({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const pulse = useSharedValue(0.45);
  const shimmerX = useSharedValue(-80);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 750 }), withTiming(0.45, { duration: 750 })),
      -1,
      true,
    );
    shimmerX.value = withRepeat(withTiming(200, { duration: 1000 }), -1, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value }] }));

  return (
    <View style={skeletonStyles.wrap}>
      {SKELETON_WIDTHS.map((w, i) => (
        <View key={i} style={[skeletonStyles.row, { backgroundColor: colors.secondary }]}>
          <ShimmerLine
            baseColor={colors.muted}
            width={w}
            height={10}
            pulseStyle={pulseStyle}
            shimmerStyle={shimmerStyle}
          />
          <ShimmerLine
            baseColor={colors.muted}
            width={w * 0.65}
            height={8}
            pulseStyle={pulseStyle}
            shimmerStyle={shimmerStyle}
          />
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = {
  wrap: {
    gap: 8,
    paddingVertical: 4,
  },
  row: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
} as const;
