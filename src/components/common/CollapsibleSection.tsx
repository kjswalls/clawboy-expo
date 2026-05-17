import React, { useCallback, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '@/types';
import { hexToRgba } from '@/utils/color';

export function CollapsibleSection({
  header,
  colors,
  fadeColor,
  previewMaxHeight = 130,
  preview,
  renderExpanded,
}: {
  header: React.ReactNode;
  colors: ThemeColors;
  fadeColor: string;
  previewMaxHeight?: number;
  preview: React.ReactNode;
  renderExpanded: () => React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [hasExpandedOnce, setHasExpandedOnce] = useState(false);
  const rotation = useSharedValue(0);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    if (next) {
      setHasExpandedOnce(true);
    }
    rotation.value = withTiming(next ? 1 : 0, { duration: 200 });
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  const bodyContent = hasExpandedOnce ? renderExpanded() : preview;

  return (
    <>
      {/* Header row */}
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [collapsibleStyles.header, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={collapsibleStyles.headerContent}>{header}</View>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={16} color={colors.mutedForeground} />
        </Animated.View>
      </Pressable>

      {/* Body — clamped when collapsed */}
      <View style={[collapsibleStyles.body, !expanded && { maxHeight: previewMaxHeight, overflow: 'hidden' }]}>
        {bodyContent}
        {!expanded && (
          <LinearGradient
            colors={[hexToRgba(fadeColor, 0), fadeColor]}
            style={collapsibleStyles.fadeGradient}
            pointerEvents="none"
          />
        )}
      </View>

      {/* Expand / collapse chevron row */}
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [collapsibleStyles.chevronToggleRow, { borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={expanded ? t('about.collapseSection') : t('about.expandSection')}
      >
        <Animated.View style={chevronStyle}>
          <ChevronDown size={16} color={colors.mutedForeground} />
        </Animated.View>
      </Pressable>
    </>
  );
}

const collapsibleStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerContent: {
    flex: 1,
  },
  body: {
    position: 'relative',
    alignSelf: 'stretch',
  },
  fadeGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 52,
  },
  chevronToggleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
