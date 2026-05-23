import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  type PanGesture,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { useTokens } from '@/hooks/useTokens';
import type { MockSession } from '@/types';
import type { SessionActivity } from '@/types/chat-ui';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SessionSidebarList } from './SessionSidebarList';
import { SidebarErrorFallback } from './SidebarErrorFallback';
import { createSessionSidebarStyles } from './sessionSidebarStyles';

export interface SessionSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: MockSession[];
  activeSessionId: string | null;
  isSessionsLoading?: boolean;
  isConnected?: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onPinSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onResetSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onClearRecent?: () => Promise<{ deleted: number; skipped: number; failed: number }>;
  onDeleteSessions?: (keys: string[]) => Promise<{ deleted: number; skipped: number; failed: number }>;
  activityBySession?: Record<string, SessionActivity | null>;
  /**
   * Sidebar panel width in points. Supplied by the caller so the same value
   * is used by `useSessionSidebarGestures` (for clamp/snap math) and the
   * panel layout below.
   */
  sidebarWidth: number;
  /**
   * Shared translateX driving the panel's slide animation. Owned by
   * `useSessionSidebarGestures` and shared with the `openPan` attached to
   * the chat-area ancestor in `app/index.tsx`.
   */
  translateX: SharedValue<number>;
  /**
   * Pan attached to the backdrop when the panel is open. Left-drag closes
   * the panel. Constructed by `useSessionSidebarGestures`; this component
   * just wires it to the backdrop GestureDetector.
   */
  closePan: PanGesture;
}

export function SessionSidebar({
  isOpen,
  onOpenChange,
  sessions,
  activeSessionId,
  isSessionsLoading = false,
  isConnected = false,
  onSelectSession,
  onNewSession,
  onPinSession,
  onDeleteSession,
  onResetSession,
  onRenameSession,
  onClearRecent,
  onDeleteSessions,
  activityBySession,
  sidebarWidth,
  translateX,
  closePan,
}: SessionSidebarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeContext();
  const sidebarTokens = useTokens();
  const styles = useMemo(() => createSessionSidebarStyles(sidebarTokens), [sidebarTokens]);

  const tapBackdrop = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd((_e, success) => {
          if (success) runOnJS(onOpenChange)(false);
        }),
    [onOpenChange]
  );

  const backdropGesture = useMemo(
    () => Gesture.Race(closePan, tapBackdrop),
    [closePan, tapBackdrop]
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-sidebarWidth, 0], [0, 0.6], Extrapolation.CLAMP),
  }));

  const sidebarPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const interactive = isOpen;

  return (
    <View style={[styles.root, { zIndex: 200 }]} pointerEvents="box-none">
      {/* Backdrop — always rendered so the close animation fades smoothly.
          Holds the close-Pan (left-drag-to-close) and the tap-to-close.
          pointerEvents='none' when closed lets touches fall through to the
          chat below; the openPan that handles swipe-to-open lives in
          app/index.tsx as an ancestor of the chat content. */}
      <GestureDetector gesture={backdropGesture}>
        <Animated.View
          pointerEvents={interactive ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: '#000' }]}
        />
      </GestureDetector>

      {/* Sidebar panel — always rendered for translate animation */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            width: sidebarWidth,
            paddingTop: insets.top,
            backgroundColor: colors.background,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: colors.border,
          },
          sidebarPanelStyle,
        ]}
        pointerEvents={interactive ? 'auto' : 'none'}
        accessibilityViewIsModal={isOpen}
      >
        <ErrorBoundary
          fallback={(_err, reset) => (
            <SidebarErrorFallback
              colors={colors}
              onReset={reset}
              onClose={() => onOpenChange(false)}
            />
          )}
        >
          <SessionSidebarList
            sessions={sessions}
            activeSessionId={activeSessionId}
            colors={colors}
            isOpen={isOpen}
            isLoading={isSessionsLoading}
            isConnected={isConnected}
            onOpenChange={onOpenChange}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
            onPinSession={onPinSession}
            onDeleteSession={onDeleteSession}
            onResetSession={onResetSession}
            onRenameSession={onRenameSession}
            onClearRecent={onClearRecent}
            onDeleteSessions={onDeleteSessions}
            activityBySession={activityBySession}
          />
        </ErrorBoundary>
      </Animated.View>
    </View>
  );
}
