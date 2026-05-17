import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';

import { FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { ChatUiToolCall } from '@/types/chat-ui';
import { useTranslation } from 'react-i18next';

import { BADGE_BOTTOM_Y, BELOW_BADGE_TO_NEXT_BADGE, DashedVerticalRule } from './DashedVerticalRule';
import { ToolCallCard } from './ToolCallCard';

const COLLAPSE_DELAY_MS = 2500;

interface ToolCallGroupProps {
  toolCalls: ChatUiToolCall[];
  durations?: Record<string, string>;
  hasNext: boolean;
}

export const ToolCallGroup = React.memo(function ToolCallGroup({
  toolCalls,
  durations,
  hasNext,
}: ToolCallGroupProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allDone = toolCalls.every(
    tc => tc.status === 'completed' || tc.status === 'error',
  );
  const effectiveCollapsed = userOverride ?? autoCollapsed;

  const chevron = useSharedValue(0);

  useEffect(() => {
    if (allDone) {
      timerRef.current = setTimeout(() => setAutoCollapsed(true), COLLAPSE_DELAY_MS);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setAutoCollapsed(false);
      setUserOverride(null);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [allDone]);

  useEffect(() => {
    chevron.value = withTiming(effectiveCollapsed ? 0 : 90, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [effectiveCollapsed, chevron]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value}deg` }],
  }));

  const handleToggle = () => {
    setUserOverride(prev => (prev === null ? !effectiveCollapsed : !prev));
  };

  const summaryRow = (
    <Pressable
      onPress={handleToggle}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityLabel={
        effectiveCollapsed
          ? t('chat.toolCall.groupedExpand')
          : t('chat.toolCall.groupedCollapse')
      }
      accessibilityRole="button"
      accessibilityState={{ expanded: !effectiveCollapsed }}
    >
      <View style={[styles.badge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Text style={[styles.countText, { color: colors.mutedForeground }]}>
          {toolCalls.length}
        </Text>
      </View>
      <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>
        {t('chat.toolCall.groupedLabel', { count: toolCalls.length })}
      </Text>
      <Animated.View style={chevronStyle}>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Animated.View>
    </Pressable>
  );

  if (effectiveCollapsed) {
    return (
      <View style={styles.root}>
        {hasNext ? (
          <View style={styles.downConnector} pointerEvents="none">
            <DashedVerticalRule
              height={BELOW_BADGE_TO_NEXT_BADGE}
              color={`${colors.tool}66`}
            />
          </View>
        ) : null}
        {summaryRow}
      </View>
    );
  }

  return (
    <View>
      {summaryRow}
      {toolCalls.map((tc, index) => (
        <ToolCallCard
          key={tc.id}
          toolCall={tc}
          hasNext={index < toolCalls.length - 1 || hasNext}
          duration={durations?.[tc.id]}
        />
      ))}
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
  countText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  label: {
    flex: 1,
    fontSize: FontSize.sm,
    minWidth: 0,
  },
});
