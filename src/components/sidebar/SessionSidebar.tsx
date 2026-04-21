import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { MockSession } from '@/types';
import { SessionSidebarList } from './SessionSidebarList';
import { sessionSidebarStyles as styles } from './sessionSidebarStyles';

const SPRING = { damping: 26, stiffness: 320, mass: 0.85 };

export interface SessionSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: MockSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onPinSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
}

export function SessionSidebar({
  isOpen,
  onOpenChange,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onPinSession,
  onDeleteSession,
  onRenameSession,
}: SessionSidebarProps): React.JSX.Element {
  const { width: screenW } = useWindowDimensions();
  const sidebarWidth = Math.min(280, screenW * 0.85);
  const insets = useSafeAreaInsets();
  const { colors } = useThemeContext();

  const [dragging, setDragging] = useState(false);

  const translateX = useSharedValue(isOpen ? 0 : -sidebarWidth);
  const startX = useSharedValue(0);
  const sw = useSharedValue(sidebarWidth);

  useEffect(() => {
    sw.value = sidebarWidth;
  }, [sidebarWidth, sw]);

  useEffect(() => {
    translateX.value = withSpring(isOpen ? 0 : -sidebarWidth, SPRING);
  }, [isOpen, sidebarWidth, translateX]);

  const setDraggingJs = useCallback((v: boolean) => {
    setDragging(v);
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onStart(() => {
          startX.value = translateX.value;
          runOnJS(setDraggingJs)(true);
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
        })
        .onFinalize(() => {
          runOnJS(setDraggingJs)(false);
        }),
    [onOpenChange, setDraggingJs, startX, sw, translateX]
  );

  const tapBackdrop = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        const edge = sw.value + translateX.value;
        if (e.absoluteX > edge) {
          runOnJS(onOpenChange)(false);
        }
      }),
    [onOpenChange, sw, translateX]
  );

  const drawerGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, tapBackdrop),
    [panGesture, tapBackdrop]
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-sw.value, 0], [0, 0.6], Extrapolation.CLAMP),
  }));

  const sidebarPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const interactive = isOpen || dragging;

  return (
    <View style={[styles.root, { zIndex: 200 }]} pointerEvents="box-none">
      <GestureDetector gesture={drawerGesture}>
        <Animated.View style={styles.gestureLayer} pointerEvents="box-none">
          <Animated.View
            pointerEvents={interactive ? 'auto' : 'none'}
            style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: '#000' }]}
          />

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
          >
            <SessionSidebarList
              sessions={sessions}
              activeSessionId={activeSessionId}
              colors={colors}
              onOpenChange={onOpenChange}
              onSelectSession={onSelectSession}
              onNewSession={onNewSession}
              onPinSession={onPinSession}
              onDeleteSession={onDeleteSession}
              onRenameSession={onRenameSession}
            />
          </Animated.View>

          <View
            style={[styles.edgeStrip, { zIndex: 3 }]}
            pointerEvents={!interactive ? 'auto' : 'none'}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
