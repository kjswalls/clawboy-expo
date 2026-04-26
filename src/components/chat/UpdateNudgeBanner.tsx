import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function UpdateNudgeBanner({ visible, onDismiss }: Props): React.JSX.Element {
  const { colors } = useThemeContext();
  const open = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    open.value = withTiming(visible ? 1 : 0, { duration: 180 });
  }, [open, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    maxHeight: 56 * open.value,
    marginBottom: Spacing.sm * open.value,
    transform: [{ translateY: -6 * (1 - open.value) }],
    overflow: 'hidden',
  }));

  return (
    <Animated.View style={animatedStyle}>
      <View style={[styles.banner, { backgroundColor: `${colors.warning}22`, borderColor: `${colors.warning}55` }]}>
        <Text style={[styles.text, { color: colors.warningText }]} numberOfLines={2}>
          A required update is available. Go to Settings → About to check for updates.
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Dismiss update notice"
          accessibilityRole="button"
        >
          <X size={14} color={colors.warningText} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 2,
  },
});
