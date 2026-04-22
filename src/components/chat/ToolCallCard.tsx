import React, { useEffect, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
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
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight, Code, FileText, Image, Loader2, Search } from 'lucide-react-native';

import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import type { ChatUiToolCall } from '@/types/chat-ui';

import { DashedVerticalRule, getInterBlockConnectorLayout } from './DashedVerticalRule';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const ICONS = {
  file_read: FileText,
  web_search: Search,
  code_execution: Code,
  image_generation: Image,
} as const;

const DONE_LABEL: Record<ChatUiToolCall['type'], string> = {
  file_read: 'Read',
  web_search: 'Searched',
  code_execution: 'Ran code',
  image_generation: 'Generated image',
};

const RUN_LABEL: Record<ChatUiToolCall['type'], string> = {
  file_read: 'Reading...',
  web_search: 'Searching...',
  code_execution: 'Running code...',
  image_generation: 'Generating image...',
};

interface ToolCallCardProps {
  toolCall: ChatUiToolCall;
  showConnector?: boolean;
  previousBlockHeight?: number;
}

export const ToolCallCard = React.memo(function ToolCallCard({
  toolCall,
  showConnector = false,
  previousBlockHeight,
}: ToolCallCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [bodyRuleHeight, setBodyRuleHeight] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const chevron = useSharedValue(0);
  const spin = useSharedValue(0);

  const Icon = ICONS[toolCall.type];
  const isRunning = toolCall.status === 'running' || toolCall.status === 'pending';
  const hasDetail = Boolean(toolCall.input || toolCall.output);
  const statusLabel = isRunning ? RUN_LABEL[toolCall.type] : DONE_LABEL[toolCall.type];

  useEffect(() => {
    height.value = withTiming(expanded ? contentHeight : 0, { duration: 200 });
    opacity.value = withTiming(expanded ? 1 : 0, { duration: 200 });
    chevron.value = withTiming(expanded ? 90 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [expanded, contentHeight, chevron, height, opacity]);

  useEffect(() => {
    if (isRunning) {
      spin.value = withRepeat(
        withTiming(360, { duration: 900, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      spin.value = withTiming(0, { duration: 200 });
    }
  }, [isRunning, spin]);

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

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

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
        onPress={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
        style={({ pressed }) => [styles.row, pressed && hasDetail && styles.rowPressed]}
      >
        <View style={styles.badge}>
          {isRunning ? (
            <Animated.View style={spinStyle}>
              <Loader2 size={14} color={Colors.dark.mutedForeground} />
            </Animated.View>
          ) : (
            <Icon size={14} color={Colors.dark.mutedForeground} />
          )}
        </View>

        <View style={styles.mid}>
          <Text style={styles.status} numberOfLines={1}>
            {statusLabel}
          </Text>
          {(toolCall.name || toolCall.input) ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.detail} numberOfLines={1}>
                {toolCall.name || toolCall.input}
              </Text>
            </>
          ) : null}
        </View>

        {hasDetail ? (
          <Animated.View style={chevronStyle}>
            <ChevronRight size={16} color={Colors.dark.mutedForeground} />
          </Animated.View>
        ) : null}
      </Pressable>

      {hasDetail ? (
        <>
          <View style={styles.measureHidden} pointerEvents="none">
            <View style={styles.expandWrap}>
              <View style={styles.bodyRow} onLayout={onMeasure}>
                <View style={styles.measureDashStub} />
                <View style={styles.bodyDetailCol}>
                  <DetailBlock input={toolCall.input} output={toolCall.output} />
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
              <View style={styles.bodyDetailCol}>
                <DetailBlock input={toolCall.input} output={toolCall.output} />
              </View>
            </View>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
});

function DetailBlock({
  input,
  output,
}: {
  input?: string;
  output?: string;
}): React.JSX.Element {
  return (
    <View style={styles.detailStack}>
      {input ? (
        <View>
          <Text style={styles.sectionLabel}>Input</Text>
          <Text style={styles.monoBox}>{input}</Text>
        </View>
      ) : null}
      {output ? (
        <View>
          <Text style={styles.sectionLabel}>Output</Text>
          <ScrollView style={styles.outScroll} nestedScrollEnabled>
            <Text style={styles.monoBox}>{output}</Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

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
    backgroundColor: Colors.dark.secondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  mid: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  status: {
    fontSize: FontSize.sm,
    color: Colors.dark.mutedForeground,
    flexShrink: 0,
  },
  dot: {
    fontSize: FontSize.sm,
    color: 'rgba(139, 139, 139, 0.4)',
    flexShrink: 0,
  },
  detail: {
    flex: 1,
    fontSize: FontSize.sm,
    color: 'rgba(139, 139, 139, 0.7)',
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
  bodyDetailCol: {
    flex: 1,
    minWidth: 0,
    paddingLeft: Spacing.sm,
    gap: Spacing.sm,
  },
  detailStack: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    color: 'rgba(139, 139, 139, 0.7)',
    marginBottom: 4,
  },
  monoBox: {
    fontSize: FontSize.sm,
    fontFamily: monoFont,
    color: Colors.dark.mutedForeground,
    backgroundColor: 'rgba(26, 31, 46, 0.3)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  outScroll: {
    maxHeight: 128,
  },
});
