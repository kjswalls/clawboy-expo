import React from 'react';
import { View } from 'react-native';
import Animated, {
  useDerivedValue,
  useSharedValue,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';

interface CollapseWhenProps {
  collapsed: boolean;
  children: React.ReactNode;
}

export function CollapseWhen({ collapsed, children }: CollapseWhenProps): React.JSX.Element {
  const measured = useSharedValue(0);
  const progress = useDerivedValue(() =>
    withTiming(collapsed ? 0 : 1, { duration: 150 })
  );
  const style = useAnimatedStyle(() => {
    const m = measured.value;
    if (m === 0) {
      return { opacity: progress.value, overflow: 'hidden' };
    }
    return {
      height: progress.value * m,
      opacity: progress.value,
      overflow: 'hidden',
    };
  });
  return (
    <Animated.View style={style} pointerEvents={collapsed ? 'none' : 'auto'}>
      <View
        onLayout={(e) => {
          measured.value = e.nativeEvent.layout.height;
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
