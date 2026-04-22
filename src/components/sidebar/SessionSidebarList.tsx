import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { ChevronDown, ChevronRight, MessageSquare, Pin, Plus, X } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { MockSession, ThemeColors } from '@/types';
import { SessionRow } from './SessionRow';
import { sessionSidebarStyles as styles } from './sessionSidebarStyles';

export interface SessionSidebarListProps {
  sessions: MockSession[];
  activeSessionId: string | null;
  colors: ThemeColors;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onPinSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
}

export function SessionSidebarList({
  sessions,
  activeSessionId,
  colors,
  isOpen,
  onOpenChange,
  onSelectSession,
  onNewSession,
  onPinSession,
  onDeleteSession,
  onRenameSession,
}: SessionSidebarListProps): React.JSX.Element {
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);

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

  return (
    <>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Sessions</Text>
        <Pressable
          onPress={() => onOpenChange(false)}
          accessibilityLabel="Close"
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
          <Text style={[styles.newSessionText, { color: colors.foreground }]}>New Session</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {sessions.length === 0 ? (
          <View style={styles.emptyBig}>
            <MessageSquare size={32} color={`${colors.mutedForeground}80`} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No chats yet</Text>
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
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Pinned</Text>
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
              <Pressable
                onPress={() => setRecentExpanded((p) => !p)}
                style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.sectionHeaderLeft}>
                  <MessageSquare size={12} color={colors.mutedForeground} />
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    Recent Sessions
                  </Text>
                </View>
                <Animated.View style={recentChevronStyle}>
                  <ChevronDown size={16} color={colors.mutedForeground} />
                </Animated.View>
              </Pressable>
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
                    <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No chats yet</Text>
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
