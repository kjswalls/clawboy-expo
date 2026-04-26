import React, { useState } from 'react';
import {
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
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight, Clapperboard, Image, Wrench } from 'lucide-react-native';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { InternalContextEvent } from '@/lib/openclaw/utils';

interface InternalEventCardProps {
  event: InternalContextEvent;
  timestamp?: Date;
}

/** Source → icon mapping. Falls back to generic Wrench. */
function SourceIcon({
  source,
  color,
}: {
  source?: string;
  color: string;
}): React.JSX.Element {
  const s = source?.toLowerCase() ?? '';
  if (s.includes('video')) return <Clapperboard size={14} color={color} />;
  if (s.includes('image') || s.includes('photo')) return <Image size={14} color={color} />;
  return <Wrench size={14} color={color} />;
}

/** Human-readable label for the collapsed row. */
function cardTitle(event: InternalContextEvent): string {
  const typeLabel = event.type ?? event.source?.replace(/_/g, ' ') ?? 'background task';
  return `Background task: ${typeLabel}`;
}

/** Status pill text + colour intent. */
function statusLabel(status?: string): { text: string; success: boolean } {
  if (!status) return { text: 'unknown', success: false };
  const lower = status.toLowerCase();
  return {
    text: status,
    success: lower.includes('complete') || lower.includes('success'),
  };
}

export function InternalEventCard({
  event,
  timestamp,
}: InternalEventCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const chevron = useSharedValue(0);

  const displayResultText = event.cleanResultText ?? event.resultText;
  const hasDetail = Boolean(event.task || displayResultText);
  const title = cardTitle(event);
  const { text: pill, success } = statusLabel(event.status);

  const onExpandToggle = (): void => {
    if (!hasDetail) return;
    const next = !expanded;
    setExpanded(next);
    height.value = withTiming(next ? contentHeight : 0, { duration: 200 });
    opacity.value = withTiming(next ? 1 : 0, { duration: 200 });
    chevron.value = withTiming(next ? 90 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  };

  const onMeasure = (e: LayoutChangeEvent): void => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - contentHeight) > 1) {
      setContentHeight(h);
      if (expanded) {
        height.value = h;
      }
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

  const pillBg = success
    ? 'rgba(34, 197, 94, 0.15)'
    : 'rgba(245, 158, 11, 0.15)';
  const pillText = success ? 'rgb(34, 197, 94)' : 'rgb(245, 158, 11)';

  return (
    <View style={styles.root}>
      <Pressable
        onPress={onExpandToggle}
        disabled={!hasDetail}
        style={({ pressed }) => [styles.row, pressed && hasDetail && styles.rowPressed]}
        accessibilityLabel={expanded ? `Collapse ${title}` : `Expand ${title}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: hasDetail ? expanded : undefined }}
      >
        {/* Left icon badge */}
        <View style={[styles.badge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <SourceIcon source={event.source} color={colors.mutedForeground} />
        </View>

        {/* Title + status pill */}
        <View style={styles.mid}>
          <Text
            style={[styles.title, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {event.status ? (
            <>
              <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
              <View style={[styles.pill, { backgroundColor: pillBg }]}>
                <Text style={[styles.pillText, { color: pillText }]} numberOfLines={1}>
                  {pill}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Chevron */}
        {hasDetail ? (
          <Animated.View style={chevronStyle}>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Animated.View>
        ) : null}
      </Pressable>

      {/* Hidden measure pass — keeps dimensions stable */}
      {hasDetail ? (
        <>
          <View style={styles.measureHidden} pointerEvents="none">
            <View style={styles.expandBody} onLayout={onMeasure}>
              <DetailBody event={event} mutedColor={colors.mutedForeground} secondaryBg={colors.secondary} />
            </View>
          </View>
          <Animated.View style={[styles.expandWrap, bodyStyle]}>
            <View style={styles.expandBody}>
              <DetailBody event={event} mutedColor={colors.mutedForeground} secondaryBg={colors.secondary} />
            </View>
          </Animated.View>
        </>
      ) : null}

      {/* Timestamp — flush right, below the card */}
      {timestamp ? (
        <Text style={[styles.ts, { color: colors.mutedForeground }]}>
          {formatTime(timestamp)}
        </Text>
      ) : null}
    </View>
  );
}

function DetailBody({
  event,
  mutedColor,
  secondaryBg,
}: {
  event: InternalContextEvent;
  mutedColor: string;
  secondaryBg: string;
}): React.JSX.Element {
  const displayResultText = event.cleanResultText ?? event.resultText;
  return (
    <View style={styles.detailStack}>
      {event.task ? (
        <View>
          <Text style={[styles.sectionLabel, { color: mutedColor }]}>Task</Text>
          <Text style={[styles.bodyText, { color: mutedColor, backgroundColor: secondaryBg }]}>
            {event.task}
          </Text>
        </View>
      ) : null}
      {displayResultText ? (
        <View>
          <Text style={[styles.sectionLabel, { color: mutedColor }]}>Result</Text>
          <ScrollView style={styles.resultScroll} nestedScrollEnabled>
            <Text style={[styles.bodyText, { color: mutedColor, backgroundColor: secondaryBg }]}>
              {displayResultText}
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
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
    borderWidth: 1,
  },
  mid: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: FontSize.sm,
    flexShrink: 1,
  },
  dot: {
    fontSize: FontSize.sm,
    opacity: 0.4,
    flexShrink: 0,
  },
  pill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pillText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  measureHidden: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
    left: 0,
    right: 0,
  },
  expandWrap: {
    marginLeft: Spacing.md + 24 + Spacing.sm,
  },
  expandBody: {
    paddingTop: 4,
    paddingBottom: Spacing.sm,
  },
  detailStack: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    opacity: 0.7,
    marginBottom: 4,
  },
  bodyText: {
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  resultScroll: {
    maxHeight: 120,
  },
  ts: {
    fontSize: FontSize.xs,
    opacity: 0.45,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
});
