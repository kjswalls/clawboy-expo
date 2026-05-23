import { useCallback, useEffect, useMemo } from 'react';
import {
  Gesture,
  type GestureType,
  type PanGesture,
} from 'react-native-gesture-handler';
import {
  clamp,
  runOnJS,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

const SPRING = { damping: 22, stiffness: 260, mass: 0.85 };

export interface SessionSidebarGestures {
  translateX: SharedValue<number>;
  openPan: PanGesture;
  closePan: PanGesture;
}

interface UseSessionSidebarGesturesParams {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sidebarWidth: number;
  /**
   * Native scroll gesture wrapping the chat's scroll component (FlashList's
   * `Animated.ScrollView`). When supplied, `openPan` is composed via
   * `simultaneousWithExternalGesture(externalScrollGesture)` so vertical
   * drags drive the chat scroll while the pan's `failOffsetY` arbitrates
   * which gesture claims the touch.
   */
  externalScrollGesture?: GestureType;
}

/**
 * Owns the sidebar's translateX shared value and constructs two always-
 * mounted Pan gestures with stable identities. The caller attaches them
 * to different host views:
 *
 *  - `openPan` → ancestor of the chat content (e.g. wrapper around
 *    `<MessageList>`). Right-drag opens the panel. Composed with
 *    `externalScrollGesture` so vertical drags inside the chat reach the
 *    underlying scroll view natively.
 *  - `closePan` → the full-screen backdrop overlay rendered by
 *    `SessionSidebar` when the panel is open. Left-drag closes the panel.
 *
 * Both pans share the same `translateX`, thresholds, snap logic, and
 * spring config. Splitting the pans (instead of one always-mounted pan on
 * a sibling overlay) is required because UIKit hit-tests every touch to a
 * single view — a sibling overlay above the chat starves the scroll view
 * of `touchesBegan`, killing vertical scroll inside the overlay region.
 * With `openPan` on an ancestor of the scroll view, the same touch reaches
 * both recognizers and `simultaneousWithExternalGesture` permits both to
 * recognize concurrently.
 */
export function useSessionSidebarGestures({
  isOpen,
  onOpenChange,
  sidebarWidth,
  externalScrollGesture,
}: UseSessionSidebarGesturesParams): SessionSidebarGestures {
  const translateX = useSharedValue(isOpen ? 0 : -sidebarWidth);
  const startX = useSharedValue(0);
  const sw = useSharedValue(sidebarWidth);

  useEffect(() => {
    sw.value = sidebarWidth;
  }, [sidebarWidth, sw]);

  useEffect(() => {
    translateX.value = withSpring(isOpen ? 0 : -sidebarWidth, SPRING);
  }, [isOpen, sidebarWidth, translateX]);

  const buildPan = useCallback(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 8])
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

  const openPan = useMemo(() => {
    const pan = buildPan();
    return externalScrollGesture
      ? pan.simultaneousWithExternalGesture(externalScrollGesture)
      : pan;
  }, [buildPan, externalScrollGesture]);

  const closePan = useMemo(() => buildPan(), [buildPan]);

  return { translateX, openPan, closePan };
}
