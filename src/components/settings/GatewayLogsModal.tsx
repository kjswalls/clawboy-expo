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
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { useGatewayLogs, MAX_LINES } from '@/hooks/useGatewayLogs';
import { emitLogsPaused, emitLogFilterApplied, emitLogSearched } from '@/badges/events';
import { useConnection } from '@/contexts/ConnectionContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import type { LogTimeFormat } from '@/lib/formatLogTimestamp';
import { formatDuration } from '@/lib/formatDuration';
import { LogLineRow } from './LogLineRow';
import {
  buildDisplayNewestFirst,
  calcSecsAgo,
  type LevelFilter,
  type LogListItem,
  type SortOrder,
} from './logs/logDisplayHelpers';
import { DaySeparatorRow } from './logs/DaySeparatorRow';
import { LogHeader } from './logs/LogHeader';
import { LogToolbar } from './logs/LogToolbar';
import { LogFilterBar } from './logs/LogFilterBar';
import { LogFooter } from './logs/LogFooter';
import { JumpToLatestPill } from './logs/JumpToLatestPill';

const SCROLL_UP_THRESHOLD = 24;
const NEAR_BOTTOM = 50;
const DEBOUNCE_MS = 150;
const TZ_MODE_KEY = 'clawboy.gatewayLogs.tzMode';
const SORT_ORDER_KEY = 'clawboy.gatewayLogs.sortOrder';

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
  const [now, setNow] = useState(() => Date.now());
  const [tzMode, setTzModeState] = useState<LogTimeFormat>('local');
  const [sortOrder, setSortOrderState] = useState<SortOrder>('newest-bottom');

  const listRef = useRef<FlatList<LogListItem>>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinnedToLatestRef = useRef(true);
  const isAutoScrollingRef = useRef(false);
  const prevContentHeightRef = useRef(0);

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
    pathHint,
    lastPollAt,
    lastNewCount,
    setPaused,
    refresh,
    clear,
  } = logsState;

  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); }, 1_000);
    return () => { clearInterval(id); };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchDebounced(searchRaw);
      if (searchRaw) emitLogSearched();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchRaw]);

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

    const levelCounts = { warn: 0, error: 0, debug: 0 };
    for (const l of lines) {
      if (l.level === 'warn')  levelCounts.warn++;
      else if (l.level === 'error') levelCounts.error++;
      else if (l.level === 'debug') levelCounts.debug++;
    }

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
      <LogHeader
        topInset={insets.top}
        statusText={statusText}
        onBack={() => { router.back(); }}
        onShare={onShare}
        paused={paused}
        onTogglePause={() => { if (!paused) emitLogsPaused(); setPaused(!paused); }}
        colors={colors}
        t={t}
      />

      <LogToolbar
        searchRaw={searchRaw}
        onSearchChange={setSearchRaw}
        wrap={wrap}
        onToggleWrap={() => { setWrap((w) => !w); }}
        sortOrder={sortOrder}
        onToggleSortOrder={() => {
          setSortOrder(sortOrder === 'newest-bottom' ? 'newest-top' : 'newest-bottom');
        }}
        tzMode={tzMode}
        onToggleTzMode={() => { setTzMode(tzMode === 'utc' ? 'local' : 'utc'); }}
        onRefresh={refresh}
        onClear={clear}
        colors={colors}
        t={t}
      />

      <LogFilterBar
        levelFilter={levelFilter}
        onSetLevelFilter={(level) => {
          if (level !== 'all') emitLogFilterApplied(level);
          setLevelFilter(level);
        }}
        colors={colors}
        t={t}
      />

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
                justifyContent: 'flex-end',
                paddingTop: Spacing.xs,
                paddingBottom: Spacing.xs,
              }
            : {
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

      <LogFooter
        filteredCount={filteredCount}
        totalCount={lines.length}
        levelCounts={levelCounts}
        spanLabel={spanLabel}
        bufferPct={bufferPct}
        maxLines={MAX_LINES}
        path={path}
        pathHint={pathHint}
        bottomInset={insets.bottom}
        onPress={onFooterPress}
        colors={colors}
        t={t}
      />

      <JumpToLatestPill
        visible={!isPinnedToLatest && displayItems.length > 0}
        onPress={jumpToLatest}
        sortOrder={sortOrder}
        bottomInset={insets.bottom}
        colors={colors}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
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
});
