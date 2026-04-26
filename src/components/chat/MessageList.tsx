import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ArrowDown } from 'lucide-react-native';

import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { hexToRgba } from '@/utils/color';
import type { ChatUiMessage, SessionActivity } from '@/types/chat-ui';
import { formatMessageTime } from '@/utils/formatting';

import { FileAttachmentCard } from './FileAttachmentCard';
import { InternalEventCard } from './InternalEventCard';
import { MediaEmbed } from './MediaEmbed';
import { MessageBubble } from './MessageBubble';
import { MessageListSkeleton } from './MessageListSkeleton';
import { StreamingText } from './StreamingText';

const ITEM_GAP = 16;
const SCROLL_UP_THRESHOLD = 24;
const NEAR_BOTTOM = 80;
const BUTTON_SHOW_DISTANCE = 200;

interface MessageListProps {
  messages: ChatUiMessage[];
  showThinking?: boolean;
  showToolCalls?: boolean;
  isLoading?: boolean;
  onRetry?: (assistantMessageId: string) => void;
  emptyStateSlot?: React.ReactNode;
  /** Current session activity — renders a labeled typing-dot row when set and no streaming bubble exists. */
  activity?: SessionActivity | null;
  /** Key of the active session — used to reset scroll state on session switch. */
  sessionKey?: string | null;
}

export function MessageList({
  messages,
  showThinking = true,
  showToolCalls = true,
  isLoading = false,
  onRetry,
  emptyStateSlot,
  activity = null,
  sessionKey,
}: MessageListProps): React.JSX.Element {
  const { colors } = useTheme();
  const listRef = useRef<FlatList<ChatUiMessage>>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Single source of truth: true only when the user has intentionally dragged
  // up far enough to "pin away" from the bottom. Everything else snaps to 0.
  const userPinnedAwayRef = useRef(false);
  const setPinnedAway = useCallback((v: boolean) => {
    userPinnedAwayRef.current = v;
  }, []);

  // True while a finger drag or momentum scroll is in flight — lets onScroll
  // distinguish real gesture movement from layout-driven scroll events (MVCP
  // anchor adjustments, hydration replacements, cell measurement).
  const isUserScrollingRef = useRef(false);

  // Show the activity row only when there's an active session activity AND there's
  // no streaming bubble already showing typing dots in the message list.
  const hasStreamingBubble = messages.some((m) => m.isStreaming);
  const activityLabel =
    activity?.label ??
    (activity?.reason === 'resetting'
      ? 'Resetting session...'
      : activity?.reason === 'compacting'
        ? 'Compacting context...'
        : activity?.reason === 'agentBusy'
          ? 'Agent is working...'
          : undefined);
  const showActivityRow = !!activity && !hasStreamingBubble;

  const prevCountRef = useRef(messages.length);

  // --- Transition state (must be declared before any effect that references them) ---
  const listOpacity = useSharedValue(1);
  const skeletonOpacity = useSharedValue(0);
  const [skeletonActive, setSkeletonActive] = useState(false);

  const prevSessionKeyRef = useRef(sessionKey);
  const prevFirstIdRef = useRef<string | null>(messages[0]?.id ?? null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror skeletonActive in a ref so the transition effect can read it
  // without being listed in deps (avoids re-triggering on state change).
  const skeletonActiveRef = useRef(false);

  const listAnimatedStyle = useAnimatedStyle(() => ({ opacity: listOpacity.value }));
  const skeletonAnimatedStyle = useAnimatedStyle(() => ({ opacity: skeletonOpacity.value }));

  // Cleanup transition timer on unmount to avoid state updates on dead component.
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  // Keep show* props in refs so renderItem can read the latest values without
  // being a new function reference on every prop change.
  const showThinkingRef = useRef(showThinking);
  showThinkingRef.current = showThinking;
  const showToolCallsRef = useRef(showToolCalls);
  showToolCallsRef.current = showToolCalls;
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  const ordered = useMemo(() => [...messages].reverse(), [messages]);

  // Snap to offset 0 (bottom of inverted list) unless the user has pinned away.
  const snapIfPinned = useCallback(() => {
    if (userPinnedAwayRef.current) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const scrollToBottom = useCallback((animated: boolean) => {
    setPinnedAway(false);
    setHasNewMessages(false);
    listRef.current?.scrollToOffset({ offset: 0, animated });
  }, [setPinnedAway]);

  // Reset scroll state on session switch. The FlatList remount (key=sessionKey)
  // handles the actual visual snap; we just clear the ref so the next
  // content/layout events aren't gated.
  useEffect(() => {
    setPinnedAway(false);
    setHasNewMessages(false);
    prevCountRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // Single transition driver: classifies every messages/sessionKey change and either
  // shows a skeleton bridge (first-time session load) or cross-fades the list
  // (cache-hit swap or same-session reconcile). Streaming chunks are no-ops.
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  useEffect(() => {
    const sessionChanged = prevSessionKeyRef.current !== sessionKey;
    const firstId = messages[0]?.id ?? null;
    const firstIdChanged = firstId !== prevFirstIdRef.current;
    prevSessionKeyRef.current = sessionKey;
    prevFirstIdRef.current = firstId;

    // Streaming chunk / send / no-op: first id stable, same session. Do nothing.
    if (!sessionChanged && !firstIdChanged) return;
    // No messages yet on same session — nothing to transition.
    if (!sessionChanged && messages.length === 0) return;

    // Session switch with no cached messages: show skeleton bridge.
    if (sessionChanged && messages.length === 0) {
      skeletonActiveRef.current = true;
      setSkeletonActive(true);
      skeletonOpacity.value = 1;
      listOpacity.value = 0;
      return;
    }

    // We have content (cache hit, reconcile, or history arrived behind skeleton).
    // Snap while invisible, then fade in.
    listOpacity.value = 0;
    const hadSkeleton = skeletonActiveRef.current;
    if (hadSkeleton) {
      skeletonOpacity.value = 1; // guarantee skeleton covers the snap frame
    }

    const r1 = requestAnimationFrame(() => {
      snapIfPinned();
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        snapIfPinned();
        listOpacity.value = withTiming(1, { duration: 120 });
        if (hadSkeleton) {
          skeletonOpacity.value = withTiming(0, { duration: 120 });
          // Unmount skeleton after its fade completes.
          if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
          transitionTimerRef.current = setTimeout(() => {
            skeletonActiveRef.current = false;
            setSkeletonActive(false);
            transitionTimerRef.current = null;
          }, 150);
        }
      });
    });
    rafRef.current = r1;

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [sessionKey, messages, snapIfPinned, listOpacity, skeletonOpacity]);

  // Show "new messages" pill only for a single new assistant row arriving while
  // the user is pinned away. User sending a message always unpins.
  useEffect(() => {
    const last = messages[messages.length - 1];
    const prev = prevCountRef.current;
    if (last?.role === 'user' && messages.length > prev) {
      setPinnedAway(false);
      setHasNewMessages(false);
    } else if (
      userPinnedAwayRef.current &&
      messages.length > prev &&
      last?.role === 'assistant'
    ) {
      setHasNewMessages(true);
    }
    prevCountRef.current = messages.length;
  }, [messages, setPinnedAway]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setShowTopFade(y > 10);
      setShowScrollBtn(y > BUTTON_SHOW_DISTANCE);

      // Arm pin-away only during an active user gesture — prevents layout-driven
      // scroll events (MVCP anchor adjustments, hydration) from falsely locking.
      if (isUserScrollingRef.current && !userPinnedAwayRef.current && y > SCROLL_UP_THRESHOLD) {
        setPinnedAway(true);
      }

      // When the user scrolls back near the bottom, clear pin-away and the pill.
      if (y < NEAR_BOTTOM && userPinnedAwayRef.current) {
        setPinnedAway(false);
        setHasNewMessages(false);
      }
    },
    [setPinnedAway],
  );

  // Mark gesture in-flight so onScroll can safely arm pin-away. The actual
  // threshold check (y > SCROLL_UP_THRESHOLD) happens in onScroll so it fires
  // even when the drag starts from y≈0 (i.e. the live streaming edge).
  const onScrollBeginDrag = useCallback(() => {
    isUserScrollingRef.current = true;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    isUserScrollingRef.current = false;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    isUserScrollingRef.current = false;
  }, []);

  const onContentSizeChange = useCallback(snapIfPinned, [snapIfPinned]);

  // renderItem has no deps — all values read via refs so the callback ref stays
  // stable across streaming chunks. FlatList uses cell identity (keyExtractor)
  // to decide what to re-render, so React.memo on MessageBubble does the work.
  const renderItem: ListRenderItem<ChatUiMessage> = useCallback(
    ({ item }) => {
      if (item.kind === 'info') {
        return <InfoMarker text={item.content} />;
      }
      if (item.kind === 'internalEvent' && item.internalEvent) {
        const hasMedia = (item.images && item.images.length > 0) || item.audioUrl || item.videoUrl;
        const hasFiles = item.files && item.files.length > 0;
        if (!hasMedia && !hasFiles) {
          return <InternalEventCard event={item.internalEvent} timestamp={item.timestamp} />;
        }
        return (
          <View>
            <InternalEventCard event={item.internalEvent} timestamp={item.timestamp} />
            <MediaEmbed
              images={item.images}
              audioUrl={item.audioUrl}
              videoUrl={item.videoUrl}
              align="left"
              guessedMedia={item.guessedMedia}
            />
            {hasFiles
              ? item.files!.map((f, i) => (
                  <FileAttachmentCard
                    key={`${f.url}-${i}`}
                    file={f}
                    guessedMedia={item.guessedMedia}
                  />
                ))
              : null}
          </View>
        );
      }
      return (
        <MessageBubble
          message={item}
          showThinking={showThinkingRef.current}
          showToolCalls={showToolCallsRef.current}
          onRetry={onRetryRef.current}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const keyExtractor = useCallback((item: ChatUiMessage) => item.id, []);

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (hasNewMessages) {
      pulse.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 500 }), withTiming(1, { duration: 500 })),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [hasNewMessages, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  // Pill is visible when scrolled far enough for the plain "Scroll to bottom"
  // affordance, OR whenever there are new messages while the user is pinned
  // away (even if they only dragged up a small amount).
  const showPill = showScrollBtn || hasNewMessages;

  const scrollBtnOpacity = useSharedValue(0);
  const scrollBtnTranslateY = useSharedValue(6);

  useEffect(() => {
    scrollBtnOpacity.value = withTiming(showPill ? 1 : 0, { duration: 150 });
    scrollBtnTranslateY.value = withTiming(showPill ? 0 : 6, { duration: 150 });
  }, [showPill, scrollBtnOpacity, scrollBtnTranslateY]);

  const scrollBtnStyle = useAnimatedStyle(() => ({
    opacity: scrollBtnOpacity.value,
    transform: [{ translateY: scrollBtnTranslateY.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.headerEdgeGlowWrap}>
        <LinearGradient
          colors={['transparent', 'rgba(168,85,247,0.26)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.headerEdgeGlow}
        />
      </View>

      <View
        pointerEvents="none"
        style={[styles.topFade, { opacity: showTopFade ? 1 : 0 }]}
      >
        <LinearGradient
          colors={[hexToRgba(colors.background, 0.65), hexToRgba(colors.background, 0)]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {isLoading && messages.length === 0 ? (
        <MessageListSkeleton />
      ) : !isLoading && messages.length === 0 && !skeletonActive && emptyStateSlot ? (
        emptyStateSlot
      ) : (
        <View style={styles.stack}>
          <Animated.View style={[styles.flex, listAnimatedStyle]}>
            <FlatList
              key={sessionKey ?? 'none'}
              ref={listRef}
              data={ordered}
              inverted
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
              onScroll={onScroll}
              onScrollBeginDrag={onScrollBeginDrag}
              onScrollEndDrag={onScrollEndDrag}
              onMomentumScrollEnd={onMomentumScrollEnd}
              scrollEventThrottle={16}
              onContentSizeChange={onContentSizeChange}
              onLayout={snapIfPinned}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={ItemSep}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={4}
              updateCellsBatchingPeriod={50}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              ListHeaderComponent={
                showActivityRow ? (
                  <View style={styles.activityRow}>
                    <StreamingText label={activityLabel} />
                    {activity ? (
                      <Text style={[styles.activityTime, { color: colors.mutedForeground }]}>
                        {formatMessageTime(new Date(activity.since))}
                      </Text>
                    ) : null}
                  </View>
                ) : null
              }
            />
          </Animated.View>
          {skeletonActive ? (
            <Animated.View
              style={[StyleSheet.absoluteFill, skeletonAnimatedStyle]}
              pointerEvents="none"
            >
              <MessageListSkeleton />
            </Animated.View>
          ) : null}
        </View>
      )}

      <Animated.View
        style={[styles.scrollBtnWrap, scrollBtnStyle]}
        pointerEvents={showPill ? 'auto' : 'none'}
      >
        <Pressable
          onPress={() => scrollToBottom(true)}
          style={({ pressed }) => [styles.scrollBtn, { backgroundColor: colors.secondary, borderColor: colors.border }, pressed && { opacity: 0.85 }]}
          accessibilityLabel={hasNewMessages ? 'New messages — scroll to bottom' : 'Scroll to bottom'}
          accessibilityRole="button"
        >
          {hasNewMessages ? (
            <Animated.View style={[styles.newDot, { backgroundColor: colors.primary }, dotStyle]} />
          ) : null}
          <ArrowDown size={14} color={colors.foreground} />
          <Text style={[styles.scrollLabel, { color: colors.foreground }]}>
            {hasNewMessages ? 'New messages' : 'Scroll to bottom'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ItemSep(): React.JSX.Element {
  return <View style={{ height: ITEM_GAP }} />;
}

function InfoMarker({ text }: { text: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={infoStyles.row}>
      <View style={[infoStyles.line, { backgroundColor: colors.border }]} />
      <Text style={[infoStyles.label, { color: colors.mutedForeground }]}>{text}</Text>
      <View style={[infoStyles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  line: {
    flex: 1,
    height: 1,
    opacity: 0.5,
  },
  label: {
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    position: 'relative',
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 36,
    zIndex: 10,
  },
  headerEdgeGlowWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  headerEdgeGlow: {
    width: '56%',
    height: 2,
  },
  stack: {
    flex: 1,
    position: 'relative',
  },
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  scrollBtnWrap: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scrollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  newDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scrollLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  activityRow: {
    paddingBottom: ITEM_GAP,
    gap: Spacing.sm,
  },
  activityTime: {
    fontSize: 11,
    paddingHorizontal: 4,
  },
});
