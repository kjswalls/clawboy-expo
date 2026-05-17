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
import { emitCardExpanded } from '@/badges/events';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight, Code, FileText, Image, Loader2, Search } from 'lucide-react-native';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { ChatUiToolCall } from '@/types/chat-ui';
import { useTranslation } from 'react-i18next';

import { BADGE_BOTTOM_Y, BELOW_BADGE_TO_NEXT_BADGE, DashedVerticalRule } from './DashedVerticalRule';

const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const ICONS = {
  file_read: FileText,
  web_search: Search,
  code_execution: Code,
  image_generation: Image,
} as const;

interface ToolCallCardProps {
  toolCall: ChatUiToolCall;
  hasNext?: boolean;
  /** Human-readable elapsed time (e.g. "2s"). Shown after the status label when set. */
  duration?: string;
}

export const ToolCallCard = React.memo(function ToolCallCard({
  toolCall,
  hasNext = false,
  duration,
}: ToolCallCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const chevron = useSharedValue(0);
  const spin = useSharedValue(0);

  const Icon = ICONS[toolCall.type];
  const isRunning = toolCall.status === 'running' || toolCall.status === 'pending';
  const hasDetail = Boolean(toolCall.input || toolCall.output);

  const DONE_LABEL: Record<ChatUiToolCall['type'], string> = {
    file_read: t('chat.toolCall.doneRead'),
    web_search: t('chat.toolCall.doneSearch'),
    code_execution: t('chat.toolCall.doneCode'),
    image_generation: t('chat.toolCall.doneImage'),
  };

  const RUN_LABEL: Record<ChatUiToolCall['type'], string> = {
    file_read: t('chat.toolCall.runRead'),
    web_search: t('chat.toolCall.runSearch'),
    code_execution: t('chat.toolCall.runCode'),
    image_generation: t('chat.toolCall.runImage'),
  };

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

  const connectorStyle = useAnimatedStyle(() => ({
    height: height.value + (hasNext ? BELOW_BADGE_TO_NEXT_BADGE : 0),
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.downConnector, connectorStyle]} pointerEvents="none">
        <DashedVerticalRule
          height={contentHeight + BELOW_BADGE_TO_NEXT_BADGE}
          color={`${colors.tool}66`}
        />
      </Animated.View>

      <Pressable
        onPress={() => {
          if (!hasDetail) return;
          if (!expanded) emitCardExpanded();
          setExpanded(!expanded);
        }}
        disabled={!hasDetail}
        style={({ pressed }) => [styles.row, pressed && hasDetail && styles.rowPressed]}
        accessibilityLabel={expanded ? t('chat.toolCall.inputLabel', { name: toolCall.name }) : t('chat.toolCall.outputLabel', { name: toolCall.name })}
        accessibilityRole="button"
        accessibilityState={{ expanded: hasDetail ? expanded : undefined }}
      >
        <View style={[styles.badge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          {isRunning ? (
            <Animated.View style={spinStyle}>
              <Loader2 size={14} color={colors.mutedForeground} />
            </Animated.View>
          ) : (
            <Icon size={14} color={colors.mutedForeground} />
          )}
        </View>

        <View style={styles.mid}>
          <Text style={[styles.status, { color: colors.mutedForeground }]} numberOfLines={1}>
            {statusLabel}
          </Text>
          {(toolCall.name || toolCall.input) ? (
            <>
              <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
              <Text style={[styles.detail, { color: colors.mutedForeground }]} numberOfLines={1}>
                {toolCall.name || toolCall.input}
              </Text>
            </>
          ) : null}
          {!isRunning && duration ? (
            <>
              <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
              <Text style={[styles.duration, { color: colors.mutedForeground }]}>
                {duration}
              </Text>
            </>
          ) : null}
        </View>

        {hasDetail ? (
          <Animated.View style={chevronStyle}>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Animated.View>
        ) : null}
      </Pressable>

      {hasDetail ? (
        <>
          <View style={styles.measureHidden} pointerEvents="none">
            <View style={styles.expandWrap}>
              <View style={styles.bodyRow} onLayout={onMeasure}>
                <View style={styles.bodyDetailCol}>
                  <DetailBlock input={toolCall.input} output={toolCall.output} mutedColor={colors.mutedForeground} secondaryBg={colors.secondary} />
                </View>
              </View>
            </View>
          </View>
          <Animated.View style={[styles.expandWrap, bodyStyle]}>
            <View style={styles.bodyRow}>
              <View style={styles.bodyDetailCol}>
                <DetailBlock input={toolCall.input} output={toolCall.output} mutedColor={colors.mutedForeground} secondaryBg={colors.secondary} />
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
  mutedColor,
  secondaryBg,
}: {
  input?: string;
  output?: string;
  mutedColor: string;
  secondaryBg: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={styles.detailStack}>
      {input ? (
        <View>
          <Text style={[styles.sectionLabel, { color: mutedColor }]}>{t('chat.toolCall.inputLabel')}</Text>
          <Text style={[styles.monoBox, { color: mutedColor, backgroundColor: secondaryBg }]}>{input}</Text>
        </View>
      ) : null}
      {output ? (
        <View>
          <Text style={[styles.sectionLabel, { color: mutedColor }]}>{t('chat.toolCall.outputLabel')}</Text>
          <ScrollView style={styles.outScroll} nestedScrollEnabled>
            <Text style={[styles.monoBox, { color: mutedColor, backgroundColor: secondaryBg }]}>{output}</Text>
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
  mid: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  status: {
    fontSize: FontSize.sm,
    flexShrink: 0,
  },
  dot: {
    fontSize: FontSize.sm,
    flexShrink: 0,
    opacity: 0.4,
  },
  detail: {
    flex: 1,
    fontSize: FontSize.sm,
    opacity: 0.7,
  },
  duration: {
    fontSize: FontSize.xs,
    flexShrink: 0,
    opacity: 0.5,
  },
  measureHidden: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
    left: 0,
    right: 0,
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
    opacity: 0.7,
    marginBottom: 4,
  },
  monoBox: {
    fontSize: FontSize.sm,
    fontFamily: monoFont,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  outScroll: {
    maxHeight: 128,
  },
});
