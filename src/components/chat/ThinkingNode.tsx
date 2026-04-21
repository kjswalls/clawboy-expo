import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Brain, ChevronRight } from 'lucide-react-native';

import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import type { ChatUiThinkingBlock } from '@/types/chat-ui';

interface ThinkingNodeProps {
  thinking: ChatUiThinkingBlock;
  isActive?: boolean;
  showConnector?: boolean;
}

export const ThinkingNode = React.memo(function ThinkingNode({
  thinking,
  isActive = false,
  showConnector = false,
}: ThinkingNodeProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const chevron = useSharedValue(0);
  const brainPulse = useSharedValue(1);
  const shimmerX = useSharedValue(0);

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
      shimmerX.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      brainPulse.value = withTiming(1, { duration: 200 });
      shimmerX.value = 0;
    }
  }, [isActive, brainPulse, shimmerX]);

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

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: shimmerX.value * 160 - 80,
      },
    ],
  }));

  const labelText = isActive
    ? 'Thinking...'
    : `Thought${thinking.duration ? ` for ${thinking.duration}` : ''}`;

  return (
    <View style={styles.root}>
      {showConnector ? <View style={styles.connectorStub} /> : null}

      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.badge}>
          <Animated.View style={isActive ? brainStyle : undefined}>
            <Brain size={14} color={Colors.dark.mutedForeground} />
          </Animated.View>
        </View>

        <View style={styles.labelWrap}>
          {isActive ? (
            <MaskedView
              style={styles.masked}
              maskElement={
                <Text style={styles.maskText}>{labelText}</Text>
              }
            >
              <View style={styles.shimmerInner}>
                <Animated.View style={[styles.shimmerStrip, shimmerStyle]}>
                  <LinearGradient
                    colors={[Colors.dark.shimmerBase, Colors.dark.shimmerHighlight, Colors.dark.shimmerBase]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>
            </MaskedView>
          ) : (
            <Text style={styles.doneLabel} numberOfLines={1}>
              {labelText}
            </Text>
          )}
        </View>

        <Animated.View style={chevronStyle}>
          <ChevronRight size={16} color={Colors.dark.mutedForeground} />
        </Animated.View>
      </Pressable>

      <View style={styles.measureHidden} pointerEvents="none">
        <View style={styles.measureInner} onLayout={onMeasure}>
          <Text style={styles.bodyText}>{thinking.content}</Text>
        </View>
      </View>

      <Animated.View style={[styles.expandWrap, bodyStyle]}>
        <View style={styles.bodyBorder}>
          <Text style={styles.bodyText}>{thinking.content}</Text>
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
  connectorStub: {
    position: 'absolute',
    left: 11,
    top: -4,
    height: 4,
    width: 2,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(168, 85, 247, 0.4)',
    borderStyle: 'dashed',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
    width: '100%',
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
    backgroundColor: Colors.dark.secondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  labelWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  masked: {
    height: FontSize.sm + 4,
    justifyContent: 'center',
  },
  maskText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  shimmerInner: {
    height: FontSize.sm + 4,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  shimmerStrip: {
    width: 120,
    height: FontSize.sm + 4,
  },
  doneLabel: {
    fontSize: FontSize.sm,
    color: Colors.dark.mutedForeground,
  },
  measureHidden: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
    left: 0,
    right: 0,
  },
  measureInner: {
    paddingLeft: 32,
    paddingVertical: Spacing.sm,
    marginLeft: Spacing.md,
    marginTop: 4,
  },
  expandWrap: {
    marginLeft: Spacing.md,
  },
  bodyBorder: {
    paddingLeft: 32,
    paddingVertical: Spacing.sm,
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(168, 85, 247, 0.3)',
    borderStyle: 'dashed',
  },
  bodyText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.dark.mutedForeground,
  },
});
