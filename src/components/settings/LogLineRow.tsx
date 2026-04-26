import React, { memo, useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import type { LogLevel, LogLine } from '@/lib/logParser';
import { formatLogTime, type LogTimeFormat } from '@/lib/formatLogTimestamp';
import type { ThemeColors } from '@/types';

interface Props {
  line: LogLine;
  colors: ThemeColors;
  wrap: boolean;
  tzMode: LogTimeFormat;
}

// Fixed-width level labels (4 chars + trailing space for alignment).
const LEVEL_LABELS: Record<LogLevel, string> = {
  info:    'INFO',
  warn:    'WARN',
  error:   'ERR!',
  debug:   'DBG ',
  unknown: '    ',
};

function levelColor(level: LogLevel, colors: ThemeColors): string {
  switch (level) {
    case 'info':    return colors.primary;
    case 'warn':    return colors.warning;
    case 'error':   return colors.destructive;
    case 'debug':   return colors.mutedForeground;
    default:        return colors.mutedForeground;
  }
}

// Middle-truncate a tag to maxLen chars, e.g. "openclaw/cron" → unchanged;
// "a/very/long/subsystem/path/here" → "a/very/…/here"
function truncateTag(tag: string, maxLen = 20): string {
  if (tag.length <= maxLen) return tag;
  const half = Math.floor((maxLen - 1) / 2);
  return tag.slice(0, half) + '…' + tag.slice(tag.length - (maxLen - 1 - half));
}

const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });
const ROW_HEIGHT = 18;

function LogLineRowInner({ line, colors, wrap, tzMode }: Props): React.JSX.Element {
  const onLongPress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(line.raw);
  }, [line.raw]);

  const color = levelColor(line.level, colors);
  const tsText = formatLogTime(line.ts, tzMode);
  const levelLabel = LEVEL_LABELS[line.level] ?? '    ';
  const tagText = line.tag ? truncateTag(line.tag) : null;
  // In no-wrap mode collapse embedded newlines (stack traces) to a visual marker
  // so the row stays on a single line and the horizontal ScrollView has full
  // natural width to scroll through.
  const msgNoWrapText = wrap ? line.msg : line.msg.replace(/\n/g, '  ⏎  ');

  const prefix = (
    <View style={styles.prefix}>
      <Text style={[styles.mono, styles.ts, { color: colors.mutedForeground }]}>
        {tsText}
      </Text>
      <Text style={[styles.mono, styles.level, { color }]}>
        {' '}{levelLabel}{' '}
      </Text>
      {tagText ? (
        <Text style={[styles.mono, styles.tag, { color: colors.mutedForeground }]} numberOfLines={1}>
          {tagText}{'  '}
        </Text>
      ) : null}
    </View>
  );

  if (wrap) {
    return (
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? `${colors.foreground}08` : 'transparent' },
        ]}
        accessibilityLabel={`Log line: ${line.msg}`}
        accessibilityHint="Long press to copy raw line"
      >
        <View style={styles.wrapRow}>
          {prefix}
          <Text
            style={[styles.mono, styles.msgWrap, { color: colors.foreground }]}
            selectable
          >
            {line.msg}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        style={styles.noWrapScroll}
      >
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={400}
          style={({ pressed }) => [
            styles.noWrapPressableRow,
            { backgroundColor: pressed ? `${colors.foreground}08` : 'transparent' },
          ]}
          accessibilityLabel={`Log line: ${line.msg}`}
          accessibilityHint="Long press to copy raw line"
        >
          {prefix}
          <Text style={[styles.mono, styles.msgNoWrap, { color: colors.foreground }]}>
            {msgNoWrapText}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function areEqual(prev: Props, next: Props): boolean {
  return (
    prev.line.id === next.line.id &&
    prev.wrap === next.wrap &&
    prev.tzMode === next.tzMode &&
    prev.colors === next.colors
  );
}

export const LogLineRow = memo(LogLineRowInner, areEqual);

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_HEIGHT,
    justifyContent: 'center',
  },

  // Wrap mode: prefix and msg stack in a column-friendly row
  wrapRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexWrap: 'wrap',
  },

  // No-wrap mode: everything in a single horizontal scroll
  noWrapScroll: {
    alignSelf: 'stretch',
  },
  noWrapPressableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },

  // Shared prefix row (ts + level + tag)
  prefix: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },

  mono: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: ROW_HEIGHT,
  },

  ts: {
    opacity: 0.65,
    // 8 chars @ 11px Menlo ≈ 54px, but we let text natural-width it
  },

  level: {
    fontWeight: '600',
  },

  tag: {
    opacity: 0.6,
  },

  // Message in wrap mode
  msgWrap: {
    flex: 1,
    flexWrap: 'wrap',
    minWidth: 0,
  },

  // Message in no-wrap mode
  msgNoWrap: {
    flexShrink: 0,
  },
});
