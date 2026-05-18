import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Brain, ChevronRight } from 'lucide-react-native';

import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { ChatUiThinkingBlock } from '@/types/chat-ui';
import { useTranslation } from 'react-i18next';
import { emitCardExpanded } from '@/badges/events';

import { BADGE_BOTTOM_Y, BELOW_BADGE_TO_NEXT_BADGE, DashedVerticalRule } from './DashedVerticalRule';

const MAX_THINKING_HEIGHT = 220;

interface ThinkingNodeProps {
  thinking: ChatUiThinkingBlock;
  isActive?: boolean;
  hasNext?: boolean;
}

export const ThinkingNode = React.memo(function ThinkingNode({
  thinking,
  isActive = false,
  hasNext = false,
}: ThinkingNodeProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const chevron = useSharedValue(0);
  const brainPulse = useSharedValue(1);
  /** RN Animated (not Reanimated): transforms inside MaskedView often fail to repaint with Reanimated on iOS. */
  const shimmerProgress = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    height.value = withTiming(expanded ? contentHeight : 0, { duration: 200 });
    opacity.value = withTiming(expanded ? 1 : 0, { duration: 200 });
    chevron.value = withTiming(expanded ? 90 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [expanded, contentHeight, chevron, height, opacity]);

  useEffect(() => {
    if (isActive) {
      brainPulse.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    } else {
      brainPulse.value = withTiming(1, { duration: 200 });
    }
  }, [isActive, brainPulse]);

  useEffect(() => {
    if (!isActive) {
      shimmerProgress.stopAnimation(() => {
        shimmerProgress.setValue(0);
      });
      return;
    }
    const loop = RNAnimated.loop(
      RNAnimated.timing(shimmerProgress, {
        toValue: 1,
        duration: 2200,
        easing: RNEasing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      shimmerProgress.setValue(0);
    };
  }, [isActive, shimmerProgress]);

  const onMeasure = (e: LayoutChangeEvent): void => {
    const h = Math.min(e.nativeEvent.layout.height, MAX_THINKING_HEIGHT);
    if (h > 0 && Math.abs(h - contentHeight) > 1) {
      setContentHeight(h);
    }
  };

  const bodyStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value}deg` }],
  }));

  const brainStyle = useAnimatedStyle(() => ({
    opacity: brainPulse.value,
  }));

  const connectorStyle = useAnimatedStyle(() => ({
    height: height.value + (hasNext ? BELOW_BADGE_TO_NEXT_BADGE : 0),
  }));

  const shimmerTranslateX = useMemo(
    () =>
      shimmerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [-160, 160],
      }),
    [shimmerProgress],
  );

  const labelText = isActive
    ? t('chat.thinking.active')
    : thinking.duration
      ? t('chat.thinking.doneFor', { duration: thinking.duration })
      : t('chat.thinking.done');

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.downConnector, connectorStyle]} pointerEvents="none">
        <DashedVerticalRule
          height={contentHeight + BELOW_BADGE_TO_NEXT_BADGE}
          color={`${colors.thinking}66`}
        />
      </Animated.View>

      <Pressable
        onPress={() => {
          if (!expanded) emitCardExpanded();
          setExpanded(!expanded);
        }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityLabel={expanded ? t('chat.thinking.collapse') : t('chat.thinking.expand')}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={[styles.badge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Animated.View style={isActive ? brainStyle : undefined}>
            <Brain size={14} color={colors.mutedForeground} />
          </Animated.View>
        </View>

        <View style={styles.labelWrap}>
          {isActive ? (
            <MaskedView
              style={styles.thinkingMasked}
              maskElement={
                <Text style={styles.maskText} numberOfLines={1}>
                  {labelText}
                </Text>
              }
            >
              {/* Base fill = full glyph silhouette at readable gray (matches done state). */}
              <View style={styles.shimmerStack} collapsable={false}>
                <View style={[StyleSheet.absoluteFillObject, styles.thinkingBaseFill, { backgroundColor: colors.mutedForeground }]} />
                {/* Translucent highlight band moves over the base — mask applies to both layers. */}
                <View style={styles.shimmerClip} collapsable={false}>
                  <RNAnimated.View
                    style={[
                      styles.shimmerStrip,
                      { transform: [{ translateX: shimmerTranslateX }] },
                    ]}
                  >
                    <LinearGradient
                      colors={[
                        'rgba(255,255,255,0)',
                        'rgba(255,255,255,0.88)',
                        'rgba(255,255,255,0)',
                      ]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </RNAnimated.View>
                </View>
              </View>
            </MaskedView>
          ) : (
            <Text style={[styles.doneLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
              {labelText}
            </Text>
          )}
        </View>

        <Animated.View style={chevronStyle}>
          <ChevronRight size={16} color={colors.mutedForeground} />
        </Animated.View>
      </Pressable>

      <View style={styles.measureHidden} pointerEvents="none">
        <View style={styles.expandWrap}>
          <View style={styles.bodyRow} onLayout={onMeasure}>
            <View style={styles.bodyTextCol}>
              <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{thinking.content}</Text>
            </View>
          </View>
        </View>
      </View>

      <Animated.View style={[styles.bodyClip, bodyStyle]}>
        <View style={styles.expandWrap}>
          <View style={styles.bodyRow}>
            <View style={styles.bodyTextCol}>
              <ScrollView style={styles.bodyScroll} nestedScrollEnabled>
                <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{thinking.content}</Text>
              </ScrollView>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    width: '100%',
  },
  downConnector: {
    position: 'absolute',
    left: 11,
    top: BADGE_BOTTOM_Y,
    width: 2,
    overflow: 'hidden',
    zIndex: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
    width: '100%',
    zIndex: 1,
  },
  rowPressed: {
    opacity: 0.85,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  labelWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: FontSize.sm + 4,
    justifyContent: 'center',
  },
  thinkingMasked: {
    height: FontSize.sm + 4,
    width: '100%',
    justifyContent: 'center',
  },
  maskText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.dark.foreground,
  },
  shimmerStack: {
    flex: 1,
    width: '100%',
    minHeight: FontSize.sm + 4,
    position: 'relative',
  },
  thinkingBaseFill: {},
  shimmerClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 1,
  },
  shimmerStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 180,
    height: FontSize.sm + 4,
  },
  doneLabel: {
    fontSize: FontSize.sm,
  },
  measureHidden: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
    left: 0,
    right: 0,
  },
  bodyClip: {
    overflow: 'hidden',
  },
  bodyScroll: {
    maxHeight: MAX_THINKING_HEIGHT,
  },
  expandWrap: {
    marginLeft: Spacing.md,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
    marginTop: 4,
    paddingVertical: Spacing.sm,
  },
  bodyTextCol: {
    flex: 1,
    minWidth: 0,
    paddingLeft: Spacing.sm,
  },
  bodyText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
