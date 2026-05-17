import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const PARAGRAPH_FADE_MS = 250;

export function ParagraphFade({
  animateIn,
  children,
}: {
  animateIn: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const opacity = useSharedValue(animateIn ? 0 : 1);
  useEffect(() => {
    if (animateIn) {
      opacity.value = withTiming(1, { duration: PARAGRAPH_FADE_MS });
    }
    // Only runs once on mount — `animateIn` is captured for the lifetime of this paragraph index.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
