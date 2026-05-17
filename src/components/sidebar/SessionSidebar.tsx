import React, { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  clamp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeContext } from '@/contexts/ThemeContext';
import { useTokens } from '@/hooks/useTokens';
import type { MockSession } from '@/types';
import type { SessionActivity } from '@/types/chat-ui';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SessionSidebarList } from './SessionSidebarList';
import { SidebarErrorFallback } from './SidebarErrorFallback';
import { createSessionSidebarStyles } from './sessionSidebarStyles';

const SPRING = { damping: 22, stiffness: 260, mass: 0.85 };
// Matches ChatHeader row height: paddingVertical 8 + icon 28 + paddingVertical 8.
const CHAT_HEADER_ROW_HEIGHT = 44;

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
}: SessionSidebarProps): React.JSX.Element {
  const { width: screenW } = useWindowDimensions();
  const sidebarWidth = Math.min(280, screenW * 0.85);
  const insets = useSafeAreaInsets();
  const { colors } = useThemeContext();
  const sidebarTokens = useTokens();
  const styles = useMemo(() => createSessionSidebarStyles(sidebarTokens), [sidebarTokens]);

  const translateX = useSharedValue(isOpen ? 0 : -sidebarWidth);
  const startX = useSharedValue(0);
  const sw = useSharedValue(sidebarWidth);

  useEffect(() => {
    sw.value = sidebarWidth;
  }, [sidebarWidth, sw]);

  useEffect(() => {
    translateX.value = withSpring(isOpen ? 0 : -sidebarWidth, SPRING);
  }, [isOpen, sidebarWidth, translateX]);

  // Single Pan, always mounted — eliminates the gesture-swap reattach window that
  // caused intermittent misses on production builds after open/close transitions.
  // If a future sibling adds another Pan on this screen, compose via
  // simultaneousWithExternalGesture(panGesture) or Gesture.Native().
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // -14pt to close (when open), +8pt to open (when closed).
        .activeOffsetX([-14, 8])
        // 24pt: strict enough that vertical FlatList scrolls win, loose enough
        // that slow diagonal swipes still activate.
        .failOffsetY([-24, 24])
        .onStart(() => {
          startX.value = translateX.value;
        })
        .onUpdate((e) => {
          translateX.value = clamp(startX.value + e.translationX, -sw.value, 0);
        })
        .onEnd((e) => {
          const vx = e.velocityX;
          const threshold = sw.value * 0.5;
          let snapOpen = translateX.value > -threshold;
          if (vx > 480) snapOpen = true;
          else if (vx < -480) snapOpen = false;
          if (snapOpen) {
            translateX.value = withSpring(0, SPRING);
            runOnJS(onOpenChange)(true);
          } else {
            translateX.value = withSpring(-sw.value, SPRING);
            runOnJS(onOpenChange)(false);
          }
        }),
    [onOpenChange, startX, sw, translateX]
  );

  const tapBackdrop = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd((_e, success) => {
          if (success) runOnJS(onOpenChange)(false);
        }),
    [onOpenChange]
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-sw.value, 0], [0, 0.6], Extrapolation.CLAMP),
  }));

  const sidebarPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Closed: 72pt strip below the ChatHeader so the hamburger button is unobstructed.
  // Open: full-screen so swipe-left-to-close works from anywhere over the backdrop.
  // pointerEvents="box-none" is defensive: Pan requires translation to activate, so
  // stationary taps fall through to whatever sits underneath. RNGH native hit-test
  // ignores pointerEvents, so swipes still trigger normally. This is the React
  // Navigation Drawer pattern.
  // WARNING: if the header offset is ever removed, box-none becomes load-bearing —
  // keep the offset and box-none together.
  const topOffset = insets.top + CHAT_HEADER_ROW_HEIGHT;
  const edgeCaptureStyle = useAnimatedStyle(() => {
    const isClosed = translateX.value <= -sw.value + 1;
    return isClosed
      ? { position: 'absolute', top: topOffset, left: 0, bottom: 0, width: 72 }
      : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
  }, [topOffset]);

  const interactive = isOpen;

  return (
    <View style={[styles.root, { zIndex: 200 }]} pointerEvents="box-none">
      {/* Backdrop — always rendered so the close animation fades smoothly */}
      <GestureDetector gesture={tapBackdrop}>
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

      {/* Single Pan, always mounted. pointerEvents="auto" required: box-none with
          no children makes UIKit exclude the node from hit-testing entirely, so
          RNGH never receives touches. Taps still pass through because activeOffsetX
          [-14, 8] requires X-axis movement — stationary taps fail the gesture and
          RNGH releases the touch to the underlying view. */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={edgeCaptureStyle} pointerEvents="auto" />
      </GestureDetector>
    </View>
  );
}
