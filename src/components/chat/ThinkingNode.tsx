import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  LayoutChangeEvent,
  Pressable,
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

import { FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { ChatUiThinkingBlock } from '@/types/chat-ui';

import { DashedVerticalRule, getInterBlockConnectorLayout } from './DashedVerticalRule';

interface ThinkingNodeProps {
  thinking: ChatUiThinkingBlock;
  isActive?: boolean;
  showConnector?: boolean;
  /** Measured height of the previous internal block root (for icon-to-icon dashed connector). */
  previousBlockHeight?: number;
}

export const ThinkingNode = React.memo(function ThinkingNode({
  thinking,
  isActive = false,
  showConnector = false,
  previousBlockHeight,
}: ThinkingNodeProps): React.JSX.Element {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [bodyRuleHeight, setBodyRuleHeight] = useState(0);
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
    const h = e.nativeEvent.layout.height;
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

  const shimmerTranslateX = useMemo(
    () =>
      shimmerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [-160, 160],
      }),
    [shimmerProgress],
  );

  const labelText = isActive
    ? 'Thinking...'
    : `Thought${thinking.duration ? ` for ${thinking.duration}` : ''}`;

  const interBlockConnector = showConnector
    ? getInterBlockConnectorLayout(previousBlockHeight ?? 32)
    : { top: 0, height: 0 };

  return (
    <View style={styles.root}>
      {showConnector && interBlockConnector.height > 0 ? (
        <View
          style={[
            styles.connectorWrap,
            { top: interBlockConnector.top, height: interBlockConnector.height },
          ]}
        >
          <DashedVerticalRule
            height={interBlockConnector.height}
            color="rgba(168, 85, 247, 0.4)"
          />
        </View>
      ) : null}

      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
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
            <View style={styles.measureDashStub} />
            <View style={styles.bodyTextCol}>
              <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{thinking.content}</Text>
            </View>
          </View>
        </View>
      </View>

      <Animated.View style={[styles.expandWrap, bodyStyle]}>
        <View
          style={styles.bodyRow}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - bodyRuleHeight) > 1) {
              setBodyRuleHeight(h);
            }
          }}
        >
          <DashedVerticalRule
            height={bodyRuleHeight > 0 ? bodyRuleHeight : 1}
            color="rgba(168, 85, 247, 0.3)"
          />
          <View style={styles.bodyTextCol}>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{thinking.content}</Text>
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
  connectorWrap: {
    position: 'absolute',
    left: 11,
    width: 2,
    alignItems: 'center',
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
    color: '#FFFFFF',
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
  measureDashStub: {
    width: 2,
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
