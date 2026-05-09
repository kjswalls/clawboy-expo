import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Globe,
  RefreshCw,
  Share2,
  Pause,
  Play,
  Trash2,
  WrapText,
} from 'lucide-react-native';

import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { useGatewayLogs, MAX_LINES } from '@/hooks/useGatewayLogs';
import { useConnection } from '@/contexts/ConnectionContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { LogLevel, LogLine } from '@/lib/logParser';
import { formatLogDay, logDayKey, type LogTimeFormat } from '@/lib/formatLogTimestamp';
import { formatDuration } from '@/lib/formatDuration';
import { LogLineRow } from './LogLineRow';
import i18n from '@/i18n';

type LevelFilter = LogLevel | 'all';

type SortOrder = 'newest-bottom' | 'newest-top';

type LogListItem =
  | { kind: 'log'; id: string; line: LogLine }
  | { kind: 'day'; id: string; label: string };

const LEVEL_FILTERS: LevelFilter[] = ['all', 'info', 'warn', 'error', 'debug'];

// Replaced by t('gatewayLogs.filters.*') at render time.

/** Inverted FlatList: same semantics as MessageList — small y = pinned to live edge. */
const SCROLL_UP_THRESHOLD = 24;
const NEAR_BOTTOM = 50;
const DEBOUNCE_MS = 150;
const TZ_MODE_KEY = 'clawboy.gatewayLogs.tzMode';
const SORT_ORDER_KEY = 'clawboy.gatewayLogs.sortOrder';

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelDotColor(
  level: LevelFilter,
  colors: { success: string; warning: string; destructive: string; mutedForeground: string }
): string {
  switch (level) {
    case 'info':  return colors.success;
    case 'warn':  return colors.warning;
    case 'error': return colors.destructive;
    case 'debug': return colors.mutedForeground;
    default:      return colors.mutedForeground;
  }
}

function calcSecsAgo(lastPollAt: number | null, now: number): number | null {
  if (lastPollAt === null) return null;
  return Math.max(0, Math.round((now - lastPollAt) / 1000));
}

/** Horizontal rule with a centred date label and directional arrows — rendered between day groups. */
function DaySeparatorRow({
  label,
  direction,
  colors,
}: {
  label: string;
  direction: 'up' | 'down';
  colors: { border: string; mutedForeground: string };
}): React.JSX.Element {
  const Arrow = direction === 'up' ? ChevronUp : ChevronDown;
  const arrowLabel = direction === 'up' ? 'above' : 'below';
  return (
    <View
      style={sepStyles.row}
      accessible
      accessibilityLabel={`${label} — older logs ${arrowLabel}`}
    >
      <Arrow size={10} color={colors.mutedForeground} style={sepStyles.arrow} />
      <View style={[sepStyles.line, { backgroundColor: colors.border }]} />
      <Text style={[sepStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[sepStyles.line, { backgroundColor: colors.border }]} />
      <Arrow size={10} color={colors.mutedForeground} style={sepStyles.arrow} />
    </View>
  );
}

/**
 * Newest-first rows for inverted FlatList (matches MessageList: index 0 = live tail / visual bottom).
 * Day separators are emitted when crossing to an older calendar day while walking newest → oldest.
 */
function buildDisplayNewestFirst(result: LogLine[], tzMode: LogTimeFormat): LogListItem[] {
  if (result.length === 0) return [];
  const items: LogListItem[] = [];
  let prevDayKey: string | null = null;

  for (let i = result.length - 1; i >= 0; i--) {
    const line = result[i]!;
    const key = line.ts ? logDayKey(line.ts, tzMode) : null;

    if (key && key !== 'invalid') {
      if (prevDayKey !== null && key !== prevDayKey) {
        items.push({
          kind: 'day',
          id: `day-${key}-${line.id}`,
          label: formatLogDay(line.ts!, tzMode),
        });
      }
      prevDayKey = key;
    }

    items.push({ kind: 'log', id: line.id, line });
  }

  return items;
}

const sepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    paddingHorizontal: 6,
    gap: 4,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  arrow: {
    flexShrink: 0,
  },
});

// ── Component ─────────────────────────────────────────────────────────────────

export function GatewayLogsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isConnected } = useConnection();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [searchRaw, setSearchRaw] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [wrap, setWrap] = useState(false);
  const [isPinnedToLatest, setIsPinnedToLatest] = useState(true);
  // 1s ticker for the "updated Xs ago" label.
  const [now, setNow] = useState(() => Date.now());
  // Persisted across opens; default to local TZ.
  const [tzMode, setTzModeState] = useState<LogTimeFormat>('local');
  // Persisted across opens; default to newest at bottom (inverted list, live tail at bottom).
  const [sortOrder, setSortOrderState] = useState<SortOrder>('newest-bottom');

  const listRef = useRef<FlatList<LogListItem>>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinnedToLatestRef = useRef(true);
  const isAutoScrollingRef = useRef(false);
  const prevContentHeightRef = useRef(0);

  // Load persisted TZ and sort-order preferences on mount.
  useEffect(() => {
    AsyncStorage.getItem(TZ_MODE_KEY).then((stored) => {
      if (stored === 'utc' || stored === 'local') setTzModeState(stored);
    }).catch(() => {});
    AsyncStorage.getItem(SORT_ORDER_KEY).then((stored) => {
      if (stored === 'newest-bottom' || stored === 'newest-top') setSortOrderState(stored);
    }).catch(() => {});
  }, []);

  const setTzMode = useCallback((mode: LogTimeFormat) => {
    setTzModeState(mode);
    AsyncStorage.setItem(TZ_MODE_KEY, mode).catch(() => {});
  }, []);

  const setSortOrder = useCallback((next: SortOrder) => {
    setSortOrderState(next);
    AsyncStorage.setItem(SORT_ORDER_KEY, next).catch(() => {});
  }, []);

  const logsState = useGatewayLogs(true);
  const {
    lines,
    loading,
    error,
    paused,
    path,
    lastPollAt,
    lastNewCount,
    setPaused,
    refresh,
    clear,
  } = logsState;

  // 1s ticker (drives "Xs ago" label).
  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); }, 1_000);
    return () => { clearInterval(id); };
  }, []);

  // Debounce search input.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchDebounced(searchRaw);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchRaw]);

    // Filtered log lines (chronological), chronological list with day separators, newest-first for FlatList, clipboard text.
    const { displayItems, shareClipboardText, filteredCount, levelCounts, oldestTsMs } = useMemo(() => {
      let filtered = lines;
      if (levelFilter !== 'all') {
        filtered = filtered.filter((l) => l.level === levelFilter);
      }
      if (searchDebounced) {
        const q = searchDebounced.toLowerCase();
        filtered = filtered.filter((l) => l.raw.toLowerCase().includes(q));
      }

      const shareClipboardText = filtered.map((l) => l.raw).join('\n');
      const displayItems = buildDisplayNewestFirst(filtered, tzMode);

      // Level breakdown across the full unfiltered buffer (stable regardless of active filter).
      const levelCounts = { warn: 0, error: 0, debug: 0 };
      for (const l of lines) {
        if (l.level === 'warn')  levelCounts.warn++;
        else if (l.level === 'error') levelCounts.error++;
        else if (l.level === 'debug') levelCounts.debug++;
      }

      // Oldest parseable timestamp in the buffer for time-span calculation.
      let oldestTsMs: number | null = null;
      for (const l of lines) {
        if (l.ts) {
          const parsed = Date.parse(l.ts);
          if (!isNaN(parsed)) {
            oldestTsMs = parsed;
            break;
          }
        }
      }

      return { displayItems, shareClipboardText, filteredCount: filtered.length, levelCounts, oldestTsMs };
    }, [lines, levelFilter, searchDebounced, tzMode]);

    const bufferPct = Math.round((lines.length / MAX_LINES) * 100);
    const spanLabel = oldestTsMs !== null
      ? t('gatewayLogs.span.last', { duration: formatDuration(now - oldestTsMs) })
      : null;

    // Auto-scroll to live edge when new lines arrive and already pinned.
    const prevLengthRef = useRef(0);
    useEffect(() => {
      if (
        isPinnedToLatest &&
        displayItems.length > prevLengthRef.current &&
        displayItems.length > 0
      ) {
        isAutoScrollingRef.current = true;
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 60);
      }
      prevLengthRef.current = displayItems.length;
    }, [displayItems.length, isPinnedToLatest]);

    const onScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = e.nativeEvent.contentOffset.y;
        if (!isAutoScrollingRef.current && y > SCROLL_UP_THRESHOLD) {
          setIsPinnedToLatest(false);
          isPinnedToLatestRef.current = false;
          if (!paused && !loading) {
            setPaused(true);
          }
        }
        if (!isAutoScrollingRef.current && y < NEAR_BOTTOM) {
          setIsPinnedToLatest(true);
          isPinnedToLatestRef.current = true;
        }
      },
      [paused, loading, setPaused]
    );

    const onContentSizeChange = useCallback((_w: number, h: number) => {
      const prev = prevContentHeightRef.current;
      prevContentHeightRef.current = h;
      if (h <= prev + 1) return;
      if (!isPinnedToLatestRef.current) return;
      isAutoScrollingRef.current = true;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 60);
    }, []);

    const jumpToLatest = useCallback(() => {
      isAutoScrollingRef.current = true;
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      setIsPinnedToLatest(true);
      isPinnedToLatestRef.current = true;
      setPaused(false);
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 320);
    }, [setPaused]);

    const onShare = useCallback(() => {
      Alert.alert(
        t('gatewayLogs.share.title'),
        t('gatewayLogs.share.body'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('gatewayLogs.share.copy'),
            onPress: async () => {
              await Clipboard.setStringAsync(shareClipboardText);
            },
          },
        ]
      );
    }, [t, shareClipboardText]);

    const onFooterPress = useCallback(() => {
      if (!path) return;
      Alert.alert(
        t('gatewayLogs.pathAlert.title'),
        path,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('gatewayLogs.pathAlert.copy'),
            onPress: async () => {
              await Clipboard.setStringAsync(path);
            },
          },
        ]
      );
    }, [t, path]);

    const dividerDirection = sortOrder === 'newest-bottom' ? 'up' : 'down';

    const renderItem = useCallback(
      ({ item }: { item: LogListItem }) => {
        if (item.kind === 'day') {
          return <DaySeparatorRow label={item.label} direction={dividerDirection} colors={colors} />;
        }
        return <LogLineRow line={item.line} colors={colors} wrap={wrap} tzMode={tzMode} />;
      },
      [colors, wrap, tzMode, dividerDirection]
    );

    const keyExtractor = useCallback((item: LogListItem) => item.id, []);


    // ── Status subtitle ────────────────────────────────────────────────────────

    const statusText = (() => {
      if (!isConnected) return t('gatewayLogs.status.notConnected');
      if (loading)  return t('gatewayLogs.status.loading');
      if (paused)   return t('gatewayLogs.status.paused');
      if (lastPollAt === null) return t('gatewayLogs.status.connecting');
      const secs = calcSecsAgo(lastPollAt, now);
      const agoStr = secs === null || secs < 2
        ? t('gatewayLogs.time.justNow')
        : t('gatewayLogs.time.secsAgo', { secs });
      const newLabel = lastNewCount > 0 ? ` · ${t('gatewayLogs.status.newLines', { count: lastNewCount })}` : '';
      return `${t('gatewayLogs.status.updated', { ago: agoStr })}${newLabel}`;
    })();

    const emptyText = (() => {
      if (!isConnected) return t('gatewayLogs.empty.notConnected');
      if (loading) return t('gatewayLogs.empty.loading');
      if (error) return null;
      if (searchDebounced || levelFilter !== 'all') return t('gatewayLogs.empty.noMatch');
      return t('gatewayLogs.empty.waiting');
    })();

    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 8, borderBottomColor: colors.border },
          ]}
        >
          <Pressable
            onPress={() => { router.back(); }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel={t('gatewayLogs.close')}
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </Pressable>

            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                {t('gatewayLogs.title')}
              </Text>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {statusText}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <Pressable
                onPress={onShare}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel={t('gatewayLogs.shareLogs')}
              >
                <Share2 size={18} color={colors.mutedForeground} />
              </Pressable>
              <Pressable
                onPress={() => { setPaused(!paused); }}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel={paused ? t('gatewayLogs.resumeLiveTail') : t('gatewayLogs.pauseLiveTail')}
              >
                {paused
                  ? <Play size={18} color={colors.primary} />
                  : <Pause size={18} color={colors.mutedForeground} />
                }
              </Pressable>
            </View>
          </View>

          {/* ── Toolbar ────────────────────────────────────────────────────── */}
          <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.secondary,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              value={searchRaw}
              onChangeText={setSearchRaw}
              placeholder={t('gatewayLogs.searchPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              clearButtonMode="while-editing"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />

            <Pressable
              onPress={() => { setWrap((w) => !w); }}
              style={({ pressed }) => [
                styles.toolbarBtn,
                { borderColor: wrap ? colors.primary : colors.border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={wrap ? t('gatewayLogs.wrapDisable') : t('gatewayLogs.wrapEnable')}
            >
              <WrapText size={14} color={wrap ? colors.primary : colors.mutedForeground} />
            </Pressable>

            <Pressable
              onPress={() => {
                setSortOrder(sortOrder === 'newest-bottom' ? 'newest-top' : 'newest-bottom');
              }}
              style={({ pressed }) => [
                styles.toolbarBtnWide,
                { borderColor: sortOrder === 'newest-top' ? colors.primary : colors.border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={
                sortOrder === 'newest-bottom'
                  ? t('gatewayLogs.sortNewestBottom')
                  : t('gatewayLogs.sortNewestTop')
              }
            >
              {sortOrder === 'newest-bottom'
                ? <ArrowDown size={12} color={colors.mutedForeground} />
                : <ArrowUp size={12} color={colors.primary} />
              }
              <Text style={[styles.tzLabel, { color: sortOrder === 'newest-top' ? colors.primary : colors.mutedForeground }]}>
                {t('gatewayLogs.sortNewest')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => { setTzMode(tzMode === 'utc' ? 'local' : 'utc'); }}
              style={({ pressed }) => [
                styles.toolbarBtnWide,
                { borderColor: tzMode === 'utc' ? colors.primary : colors.border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={tzMode === 'utc' ? t('gatewayLogs.tzSwitchLocal') : t('gatewayLogs.tzSwitchUtc')}
            >
              <Globe size={12} color={tzMode === 'utc' ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tzLabel, { color: tzMode === 'utc' ? colors.primary : colors.mutedForeground }]}>
                {tzMode === 'utc' ? t('gatewayLogs.tzUtc') : t('gatewayLogs.tzLocal')}
              </Text>
            </Pressable>

            <Pressable
              onPress={refresh}
              style={({ pressed }) => [
                styles.toolbarBtn,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={t('gatewayLogs.refreshLogs')}
            >
              <RefreshCw size={14} color={colors.mutedForeground} />
            </Pressable>

            <Pressable
              onPress={clear}
              style={({ pressed }) => [
                styles.toolbarBtn,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={t('gatewayLogs.clearBuffer')}
            >
              <Trash2 size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* ── Filter bar ─────────────────────────────────────────────────── */}
          <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
            <View style={styles.chips}>
              {LEVEL_FILTERS.map((lvl) => {
                const active = levelFilter === lvl;
                return (
                  <Pressable
                    key={lvl}
                    onPress={() => { setLevelFilter(lvl); }}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: active ? `${colors.primary}22` : 'transparent',
                        borderColor: active ? colors.primary : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    {lvl !== 'all' ? (
                      <View style={[styles.levelDot, { backgroundColor: levelDotColor(lvl, colors) }]} />
                    ) : null}
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {t(`gatewayLogs.filters.${lvl}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Error banner ───────────────────────────────────────────────── */}
          {error ? (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: `${colors.destructive}18`, borderColor: colors.destructive },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={3}>
                {error}
              </Text>
            </View>
          ) : null}

          {/* ── Log list ───────────────────────────────────────────────────── */}
          <FlatList
            ref={listRef}
            data={displayItems}
            onContentSizeChange={onContentSizeChange}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted={sortOrder === 'newest-bottom'}
            nestedScrollEnabled
            onScroll={onScroll}
            scrollEventThrottle={100}
            initialNumToRender={40}
            windowSize={10}
            maxToRenderPerBatch={40}
            updateCellsBatchingPeriod={50}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              sortOrder === 'newest-bottom'
                ? {
                    // Inverted: index 0 is visual bottom. paddingTop → visual bottom, paddingBottom → visual top.
                    justifyContent: 'flex-end',
                    paddingTop: Spacing.xs,
                    paddingBottom: Spacing.xs,
                  }
                : {
                    // Non-inverted: rows flow top-to-bottom normally.
                    justifyContent: 'flex-start',
                    paddingTop: Spacing.xs,
                    paddingBottom: Spacing.xs,
                  },
            ]}
            ListEmptyComponent={
              emptyText ? (
                <View style={styles.empty}>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    {emptyText}
                  </Text>
                </View>
              ) : null
            }
          />

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <Pressable
            onPress={onFooterPress}
            disabled={!path}
            style={({ pressed }) => [
              styles.footer,
              { borderTopColor: colors.border, paddingBottom: insets.bottom || 8 },
              pressed && path ? { opacity: 0.6 } : undefined,
            ]}
            accessibilityLabel={(() => {
              const parts: string[] = [];
              const countPart = filteredCount !== lines.length
                ? t('gatewayLogs.access.footerShown', { filtered: filteredCount, total: lines.length })
                : t('gatewayLogs.access.footerLines', { count: lines.length });
              parts.push(countPart);
              if (levelCounts.warn > 0) parts.push(t('gatewayLogs.access.footerWarnings', { count: levelCounts.warn }));
              if (levelCounts.error > 0) parts.push(t('gatewayLogs.access.footerErrors', { count: levelCounts.error }));
              if (spanLabel) parts.push(spanLabel);
              parts.push(
                path
                  ? t('gatewayLogs.access.footerPath', { path })
                  : t('gatewayLogs.access.footerNoPath')
              );
              return parts.join('. ');
            })()}
          >
            {/* Line 1: counts + level breakdown */}
            <Text style={[styles.footerPrimary, { color: colors.foreground }]}>
              {filteredCount !== lines.length
                ? t('gatewayLogs.footer.shownOf', {
                    filtered: filteredCount.toLocaleString(i18n.language),
                    total: lines.length.toLocaleString(i18n.language),
                  })
                : t('gatewayLogs.footer.lines', { count: lines.length.toLocaleString(i18n.language) })}
              {levelCounts.warn > 0 ? (
                <Text>
                  <Text style={{ color: colors.mutedForeground }}>{'  ·  '}</Text>
                  <Text style={{ color: colors.warning }}>{'● '}</Text>
                  <Text>{`${levelCounts.warn} ${t('gatewayLogs.footer.warn')}`}</Text>
                </Text>
              ) : null}
              {levelCounts.error > 0 ? (
                <Text>
                  <Text style={{ color: colors.mutedForeground }}>{'  ·  '}</Text>
                  <Text style={{ color: colors.destructive }}>{'● '}</Text>
                  <Text>{`${levelCounts.error} ${t('gatewayLogs.footer.err')}`}</Text>
                </Text>
              ) : null}
              {levelCounts.debug > 0 ? (
                <Text>
                  <Text style={{ color: colors.mutedForeground }}>{'  ·  '}</Text>
                  <Text style={{ color: colors.mutedForeground }}>{'● '}</Text>
                  <Text>{`${levelCounts.debug} ${t('gatewayLogs.footer.debug')}`}</Text>
                </Text>
              ) : null}
            </Text>

            {/* Line 2: time span + buffer volume */}
            <Text style={[styles.footerSecondary, { color: colors.mutedForeground }]}>
              {spanLabel ?? '—'}
              {'  ·  '}
              {t('gatewayLogs.footer.buffered', {
                count: lines.length.toLocaleString(i18n.language),
                max: MAX_LINES.toLocaleString(i18n.language),
                pct: bufferPct,
              })}
            </Text>

            {/* Line 3: log file path (gateway may omit this in logs.tail) */}
            <Text
              style={[styles.footerPath, { color: colors.mutedForeground }]}
              numberOfLines={path ? 1 : 2}
              ellipsizeMode={path ? 'middle' : 'tail'}
            >
              {path ?? t('gatewayLogs.footer.noPath')}
            </Text>
          </Pressable>

          {/* ── Jump to latest pill ────────────────────────────────────────── */}
          {!isPinnedToLatest && displayItems.length > 0 ? (
            <Pressable
              onPress={jumpToLatest}
              style={[
                styles.jumpPill,
                {
                  backgroundColor: colors.primary,
                  // Sit above the footer bar (~52px tall now) plus a small gap.
                  bottom: (insets.bottom || 8) + 60,
                },
              ]}
              accessibilityLabel={t('gatewayLogs.jumpToLatest')}
            >
              {sortOrder === 'newest-bottom'
                ? <ArrowDown size={14} color="#fff" />
                : <ArrowUp size={14} color="#fff" />
              }
              <Text style={styles.jumpText}>{t('gatewayLogs.jumpToLatest')}</Text>
            </Pressable>
        ) : null}
      </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  headerSub: {
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Filter bar
  filterBar: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    height: 32,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.xs,
  },
  toolbarBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  toolbarBtnWide: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  tzLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },

  // Error banner
  errorBanner: {
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: FontSize.xs,
    lineHeight: 16,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },

  // Empty state
  empty: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.sm,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerPrimary: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerSecondary: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  footerPath: {
    fontSize: FontSize.xs - 1,
    textAlign: 'center',
    opacity: 0.65,
    maxWidth: '100%',
  },

  // Jump pill
  jumpPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  jumpText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
