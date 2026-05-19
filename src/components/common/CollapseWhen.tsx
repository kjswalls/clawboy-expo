import React, { useEffect, useState } from 'react';
import Animated, {
  runOnJS,
  useSharedValue,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';

interface CollapseWhenProps {
  collapsed: boolean;
  children: React.ReactNode;
}

const DURATION = 150;

/**
 * Toggle children between visible and `display: 'none'` with a 150 ms opacity
 * fade. Children stay mounted across transitions so refs / state survive.
 *
 * We deliberately avoid animating `height` here. The previous implementation
 * measured the inner natural height via `onLayout` and interpolated it, but
 * when the wrapper was constrained to `height: 0` Yoga could report a
 * stale or constrained height for the inner View, so re-expanding clipped
 * children whose natural height had grown while hidden (e.g. agent / model
 * pills changing labels). Toggling `display` sidesteps the entire measurement
 * problem — children render at their natural size whenever visible, surrounding
 * layout reflows on the same tick.
 */
export function CollapseWhen({ collapsed, children }: CollapseWhenProps): React.JSX.Element {
  const progress = useSharedValue(collapsed ? 0 : 1);
  const [hidden, setHidden] = useState(collapsed);

  useEffect(() => {
    if (collapsed) {
      progress.value = withTiming(0, { duration: DURATION }, (finished) => {
        if (finished) runOnJS(setHidden)(true);
      });
    } else {
      // Show layout first, then fade in so the children paint from opacity 0
      // rather than appearing mid-fade.
      setHidden(false);
      progress.value = withTiming(1, { duration: DURATION });
    }
  }, [collapsed, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <Animated.View
      style={[animatedStyle, hidden && styles.hidden]}
      pointerEvents={collapsed ? 'none' : 'auto'}
    >
      {children}
    </Animated.View>
  );
}

const styles = {
  hidden: { display: 'none' as const },
};
