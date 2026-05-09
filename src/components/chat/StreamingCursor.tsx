import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const BLINK_ON_MS = 530;
const BLINK_OFF_MS = 420;

/**
 * A blinking block caret rendered as an `Animated.Text` node.
 *
 * Designed to sit inline at the end of a streaming paragraph — pass it as a
 * child inside a `<Text>` or place it after the last line of markdown output.
 * The opacity animation runs entirely on the UI thread via Reanimated shared
 * values, so it never drops frames even when the JS thread is busy parsing
 * markdown chunks.
 */
export function StreamingCursor({ color }: { color: string }): React.JSX.Element {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(1, { duration: BLINK_ON_MS }),
        withTiming(0.08, { duration: 0 }),
        withTiming(0.08, { duration: BLINK_OFF_MS }),
      ),
      -1,
      false,
    );
    return () => {
      opacity.value = 1;
    };
  }, [opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[{ color, fontSize: 16, lineHeight: 24 }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {'▎'}
    </Animated.Text>
  );
}
