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

import { AudioPlayingPill } from './AudioPlayingPill';
import { FileAttachmentCard } from './FileAttachmentCard';
import { InternalEventCard } from './InternalEventCard';
import { MediaEmbed } from './MediaEmbed';
import { MessageBubble } from './MessageBubble';
import { MessageListSkeleton } from './MessageListSkeleton';
import { StreamingText } from './StreamingText';

const ITEM_GAP = 16;
// Distance from the bottom the user must scroll before we un-stick them.
const SCROLL_UP_THRESHOLD = 24;
// Distance from the bottom at which we re-stick them automatically.
const NEAR_BOTTOM = 80;

interface MessageListProps {
  messages: ChatUiMessage[];
  showThinking?: boolean;
  showToolCalls?: boolean;
  isLoading?: boolean;
  onRetry?: (assistantMessageId: string) => void;
  onSpeak?: (message: ChatUiMessage) => void;
  emptyStateSlot?: React.ReactNode;
  /** Current session activity — renders a labeled typing-dot row when set and no streaming bubble exists. */
  activity?: SessionActivity | null;
  /** Key of the active session — used to reset scroll state on session switch. */
  sessionKey?: string | null;
  /** True while TTS / server audio is actively playing. */
  isSpeaking?: boolean;
  /** Called when the user taps the stop button on the audio pill. */
  onStopSpeaking?: () => void;
}

export function MessageList({
  messages,
  showThinking = true,
  showToolCalls = true,
  isLoading = false,
  onRetry,
  onSpeak,
  emptyStateSlot,
  activity = null,
  sessionKey,
  isSpeaking = false,
  onStopSpeaking,
}: MessageListProps): React.JSX.Element {
  const { colors } = useTheme();
  const listRef = useRef<FlatList<ChatUiMessage>>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Single source of truth: true = user is at (or near) the bottom and new
  // content should auto-scroll. False = user scrolled up and we leave them
  // alone. Using a non-inverted list means the streaming bubble is always the
  // LAST item, so its growth only extends contentSize downward — it never
  // shifts older messages out of view. We only need to call stickToEnd when
  // this is true and the content grows.
  //
  // Dual ref+state: the ref is read synchronously in scroll/content callbacks;
  // the state mirror triggers pill re-renders when the value changes.
  const [pinnedToBottom, setPinnedToBottomState] = useState(true);
  const pinnedToBottomRef = useRef(true);
  const setPinnedToBottom = useCallback((v: boolean) => {
    pinnedToBottomRef.current = v;
    setPinnedToBottomState(v);
  }, []);

  // True while a finger drag or momentum scroll is in flight.
  const isUserScrollingRef = useRef(false);

  // Track the most recent layoutMeasurement.height so stickToEnd can compute
  // the correct offset without needing it passed from onLayout each time.
  const layoutHRef = useRef(0);

  // Show the activity row only when there's an active session activity AND
  // there's no streaming bubble already showing typing dots in the message list.
  const isResetting = activity?.reason === 'resetting';
  const hasStreamingBubble = !isResetting && messages.some((m) => m.isStreaming);
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
  const prevLastIdRef = useRef<string | null>(messages[messages.length - 1]?.id ?? null);
  // Separate ref for pill finalization detection — tracks the last-message id
  // across the messages effect without conflicting with the transition driver.
  const prevLastIdForPillRef = useRef<string | null>(messages[messages.length - 1]?.id ?? null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Track by the LAST message id (newest, at the bottom of the non-inverted list).
  const lastId = messages[messages.length - 1]?.id ?? null;
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skeletonActiveRef = useRef(false);

  const listAnimatedStyle = useAnimatedStyle(() => ({ opacity: listOpacity.value }));
  const skeletonAnimatedStyle = useAnimatedStyle(() => ({ opacity: skeletonOpacity.value }));

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  const showThinkingRef = useRef(showThinking);
  showThinkingRef.current = showThinking;
  const showToolCallsRef = useRef(showToolCalls);
  showToolCallsRef.current = showToolCalls;
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;
  const onSpeakRef = useRef(onSpeak);
  onSpeakRef.current = onSpeak;
  const isResettingRef = useRef(isResetting);
  isResettingRef.current = isResetting;

  const ordered = useMemo(() => {
    // Natural order (oldest first, newest last) — no reverse() needed.
    // During reset, hide transient stream-* placeholders so only the reset
    // marker (and activity row) are visible.
    if (isResetting) {
      return messages.filter((m) => !m.id.startsWith('stream-'));
    }
    return messages;
  }, [messages, isResetting]);

  // ---------------------------------------------------------------------------
  // stickToEnd — scroll to the bottom of the list.
  //
  // With a non-inverted list "bottom" is offset = contentH - layoutH.
  // We pass contentH as a parameter from onContentSizeChange so we always
  // use the freshly-reported value rather than reading a potentially stale
  // ref. layoutH comes from layoutHRef (updated in onLayout).
  //
  // forcedByReset = true bypasses the pin check for the /reset flow.
  // ---------------------------------------------------------------------------
  const stickToEnd = useCallback((contentH: number, forced = false) => {
    if (!pinnedToBottomRef.current && !forced) return;
    const lh = layoutHRef.current;
    const target = Math.max(0, contentH - lh);
    listRef.current?.scrollToOffset({ offset: target, animated: false });
  }, []);

  const scrollToBottom = useCallback((animated: boolean) => {
    setPinnedToBottom(true);
    setHasNewMessages(false);
    // We don't have the contentH here, so use scrollToEnd.
    listRef.current?.scrollToEnd({ animated });
  }, [setPinnedToBottom]);

  // Reset scroll state on session switch.
  useEffect(() => {
    setPinnedToBottom(true);
    setHasNewMessages(false);
    prevCountRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // When isResetting transitions, force-snap to the end so the reset marker
  // and activity row are visible. Bypasses pinnedToBottomRef — the user
  // couldn't have intentionally scrolled away since /reset is synchronous.
  const resetSnapRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  useEffect(() => {
    setPinnedToBottom(true);
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        resetSnapRafRef.current = null;
        // Use scrollToEnd (forced, no contentH needed here — list is small
        // right after a reset) so we always land at the visual bottom.
        listRef.current?.scrollToEnd({ animated: false });
      });
      resetSnapRafRef.current = r2;
    });
    resetSnapRafRef.current = r1;
    return () => {
      if (resetSnapRafRef.current !== null) {
        cancelAnimationFrame(resetSnapRafRef.current);
        resetSnapRafRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResetting]);

  // Transition driver: classifies every sessionKey / last-message change and
  // either shows a skeleton bridge or cross-fades the list.
  //
  // We track the LAST message id (newest) instead of the first because in a
  // non-inverted list the "interesting" edge is the bottom.
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  useEffect(() => {
    const msgs = messagesRef.current;
    const sessionChanged = prevSessionKeyRef.current !== sessionKey;
    const lastIdChanged = lastId !== prevLastIdRef.current;
    prevSessionKeyRef.current = sessionKey;
    prevLastIdRef.current = lastId;

    if (!sessionChanged && !lastIdChanged) return;
    if (!sessionChanged && msgs.length === 0) return;

    if (sessionChanged && msgs.length === 0) {
      skeletonActiveRef.current = true;
      setSkeletonActive(true);
      skeletonOpacity.value = 1;
      listOpacity.value = 0;
      return;
    }

    const hadSkeleton = skeletonActiveRef.current;
    const shouldFade = sessionChanged || hadSkeleton;
    if (shouldFade) {
      listOpacity.value = 0;
      if (hadSkeleton) {
        skeletonOpacity.value = 1;
      }
    }

    const r1 = requestAnimationFrame(() => {
      // Snap to the bottom while invisible (for session switches).
      if (shouldFade) {
        listRef.current?.scrollToEnd({ animated: false });
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (shouldFade) {
          listRef.current?.scrollToEnd({ animated: false });
          listOpacity.value = withTiming(1, { duration: 120 });
        } else {
          listOpacity.value = 1;
        }
        if (hadSkeleton) {
          skeletonOpacity.value = withTiming(0, { duration: 120 });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, lastId, listOpacity, skeletonOpacity]);

  // Show "new messages" pill when:
  //   (a) a new assistant message/placeholder is appended, OR
  //   (b) a streaming bubble finalizes in place (stream-* → real id, chat:final)
  // while the user is scrolled away from the bottom.
  // Sending a message always re-sticks.
  useEffect(() => {
    const last = messages[messages.length - 1];
    const prev = prevCountRef.current;
    const lastId = last?.id ?? null;
    const prevLastIdPill = prevLastIdForPillRef.current;
    prevLastIdForPillRef.current = lastId;

    if (last?.role === 'user' && messages.length > prev) {
      setPinnedToBottom(true);
      setHasNewMessages(false);
    } else if (!pinnedToBottomRef.current && last?.role === 'assistant') {
      const isNewMessage = messages.length > prev;
      const isFinalization =
        lastId !== prevLastIdPill &&
        prevLastIdPill?.startsWith('stream-') === true &&
        lastId !== null &&
        !lastId.startsWith('stream-');
      if (isNewMessage || isFinalization) {
        setHasNewMessages(true);
      }
    }
    prevCountRef.current = messages.length;
  }, [messages, setPinnedToBottom]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const ch = e.nativeEvent.contentSize.height;
      const lh = e.nativeEvent.layoutMeasurement.height;
      const distFromEnd = ch - lh - y;

      setShowTopFade(y > 10);

      // Un-stick the user when they drag far enough away from the bottom.
      if (isUserScrollingRef.current && pinnedToBottomRef.current && distFromEnd > SCROLL_UP_THRESHOLD) {
        setPinnedToBottom(false);
      }

      // Re-stick automatically when they scroll back near the bottom.
      if (distFromEnd < NEAR_BOTTOM && !pinnedToBottomRef.current) {
        setPinnedToBottom(true);
        setHasNewMessages(false);
      }
    },
    [setPinnedToBottom],
  );

  const onScrollBeginDrag = useCallback(() => {
    isUserScrollingRef.current = true;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    isUserScrollingRef.current = false;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    isUserScrollingRef.current = false;
  }, []);

  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      stickToEnd(h);
    },
    [stickToEnd],
  );

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      layoutHRef.current = e.nativeEvent.layout.height;
      // Also try to stick on layout changes (e.g. keyboard open/close).
      if (pinnedToBottomRef.current) {
        listRef.current?.scrollToEnd({ animated: false });
      }
    },
    [],
  );

  const renderItem: ListRenderItem<ChatUiMessage> = useCallback(
    ({ item }) => {
      if (item.kind === 'info') {
        if (isResettingRef.current && item.id.startsWith('reset-')) {
          return <View style={{ height: 0 }} />;
        }
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
          onSpeak={onSpeakRef.current}
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

  // Pill is visible when the user has scrolled away from the bottom OR there
  // are new messages. Derived purely from gesture state + message events —
  // never from live distFromEnd, which would flicker during streaming growth.
  const showPill = !pinnedToBottom || hasNewMessages;

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

  const audioPillOpacity = useSharedValue(0);
  const audioPillTranslateY = useSharedValue(6);

  useEffect(() => {
    audioPillOpacity.value = withTiming(isSpeaking ? 1 : 0, { duration: 150 });
    audioPillTranslateY.value = withTiming(isSpeaking ? 0 : 6, { duration: 150 });
  }, [isSpeaking, audioPillOpacity, audioPillTranslateY]);

  const audioPillStyle = useAnimatedStyle(() => ({
    opacity: audioPillOpacity.value,
    transform: [{ translateY: audioPillTranslateY.value }],
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
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              extraData={isResetting}
              onScroll={onScroll}
              onScrollBeginDrag={onScrollBeginDrag}
              onScrollEndDrag={onScrollEndDrag}
              onMomentumScrollEnd={onMomentumScrollEnd}
              scrollEventThrottle={16}
              onContentSizeChange={onContentSizeChange}
              onLayout={onLayout}
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
              // The activity row (typing dots) lives at the bottom of a
              // non-inverted list, below the last message.
              ListFooterComponent={
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

      <View style={styles.pillsWrap} pointerEvents="box-none">
        <Animated.View
          style={audioPillStyle}
          pointerEvents={isSpeaking ? 'auto' : 'none'}
        >
          {onStopSpeaking ? (
            <AudioPlayingPill onStop={onStopSpeaking} />
          ) : null}
        </Animated.View>

        <Animated.View
          style={scrollBtnStyle}
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
    // Push short content (e.g. just the reset marker + activity footer) to the
    // bottom of the viewport — iMessage style. flexGrow:1 makes the container
    // fill the viewport when content is shorter; justifyContent:flex-end aligns
    // the items (and ListFooterComponent) to the bottom of that space. For long
    // lists (contentH > layoutH) flexGrow is a no-op and layout is unchanged.
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  pillsWrap: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
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
    paddingTop: ITEM_GAP,
    gap: Spacing.sm,
  },
  activityTime: {
    fontSize: 11,
    paddingHorizontal: 4,
  },
});
