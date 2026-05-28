import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { X } from 'lucide-react-native';

export interface ClearInputButtonProps {
  visible: boolean;
  onPress: () => void;
  color: string;
  backgroundColor?: string;
  accessibilityLabel?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

export function ClearInputButton({
  visible,
  onPress,
  color,
  backgroundColor,
  accessibilityLabel = 'Clear input',
  size = 14,
  style,
}: ClearInputButtonProps): React.JSX.Element | null {
  if (!visible) return null;
  const dim = size + 6;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }, style]}
    >
      <View
        style={[
          styles.bubble,
          {
            width: dim,
            height: dim,
            borderRadius: dim / 2,
            backgroundColor: backgroundColor ?? 'transparent',
          },
        ]}
      >
        <X size={size} color={color} strokeWidth={2.25} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
