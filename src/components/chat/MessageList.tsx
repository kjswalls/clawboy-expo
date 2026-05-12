import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Keyboard,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';

// FlashList is on by default. Set EXPO_PUBLIC_USE_FLASH_LIST=0 in .env.local
// and restart Metro to fall back to FlatList for debugging.
const USE_FLASH_LIST = process.env.EXPO_PUBLIC_USE_FLASH_LIST !== '0';
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
import { useTokens } from '@/hooks/useTokens';
import { useAgents } from '@/hooks/useAgents';
import { useAgentFiles } from '@/hooks/useAgentFiles';
import { useFileViewer } from '@/contexts/FileViewerContext';
import { createMarkdownStyles } from '@/utils/markdownTheme';
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
import { AnnotationLayoutProvider, useCreateAnnotationLayoutRegistry } from './AnnotationLayoutContext';

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
  /** Called when the user taps a survey choice or submits free-form reply text. */
  onReplyToPrompt?: (value: string) => void;
  /** Called when the user long-presses or taps the annotate icon on an assistant bubble. */
  onAnnotate?: (message: ChatUiMessage) => void;
  /**
   * Message id currently in annotate mode — that bubble renders as AnnotatedMessageBody.
   * Changing this value recreates renderItem so the correct bubble updates.
   */
  annotateMessageId?: string | null;
  /**
   * Annotation id that should flash to indicate it's the current cycle target.
   * Passed down to AnnotatedMessageBody → InlineAnnotationRow.
   */
  highlightedAnnotationId?: string | null;
  emptyStateSlot?: React.ReactNode;
  /** Current session activity — renders a labeled typing-dot row when set and no streaming bubble exists. */
  activity?: SessionActivity | null;
  /** Key of the active session — used to reset scroll state on session switch. */
  sessionKey?: string | null;
  /** True while TTS / server audio is actively playing. */
  isSpeaking?: boolean;
  /** Called when the user taps the stop button on the audio pill. */
  onStopSpeaking?: () => void;
  /**
   * True while a `chat.history` RPC is in-flight for this session
   * (session select or manual refresh). Enables `maintainVisibleContentPosition`
   * on the FlatList during this window so that history prepends don't shift
   * the user's scroll position if they're already scrolled up.
   *
   * Kept off at all other times to avoid the iOS double-measure overhead on
   * every `onContentSizeChange` during streaming.
   */
  historyLoading?: boolean;
}

export interface MessageListHandle {
  /** Scroll to the message cell with the given id (no-op if not found). */
  scrollToMessageId: (id: string) => void;
  /**
   * Scroll precisely to the InlineAnnotationRow for the given annotation id.
   * Falls back to scrollToMessageId when the row is not yet mounted (cell
   * virtualized off-screen), then retries the measure on the next frame.
   */
  scrollToAnnotationId: (annotationId: string, messageId: string) => void;
  /**
   * Scroll so the annotation row's bottom sits just above the keyboard,
   * keeping the parent section text (rendered above the row) visible.
   * Called when a comment input gains focus.
   */
  revealSectionForAnnotation: (annotationId: string, messageId: string) => void;
}

export const MessageList = React.forwardRef<MessageListHandle, MessageListProps>(function MessageList({
  messages,
  showThinking = true,
  showToolCalls = true,
  isLoading = false,
  onRetry,
  onSpeak,
  onReplyToPrompt,
  onAnnotate,
  annotateMessageId = null,
  highlightedAnnotationId = null,
  emptyStateSlot,
  activity = null,
  sessionKey,
  isSpeaking = false,
  onStopSpeaking,
  historyLoading = false,
}, messageListRef): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Hoist expensive per-bubble hook calls to the list level so they run once
  // instead of once per visible cell (14× for a typical chat history).
  const { fs } = useTokens();
  const { currentAgent } = useAgents();
  const { files } = useAgentFiles(currentAgent?.id);
  const { openFile } = useFileViewer();
  const markdownStyles = useMemo(() => createMarkdownStyles(colors, fs), [colors, fs]);

  // Single ref typed loosely so the same call sites (`scrollToOffset`,
  // `scrollToEnd`) work for both FlatList and FlashList — both expose the
  // same shape (`{ offset, animated }` / `{ animated }`).
  const listRef = useRef<FlatList<ChatUiMessage> | FlashListRef<ChatUiMessage> | null>(null);
  // Top-fade opacity is driven directly by a shared value rather than React
  // state so that scrolling past the trigger threshold doesn't trigger a list-
  // level commit on every onScroll frame. Behavior is identical: 0 when at
  // top, 1 when scrolled past 10px.
  const topFadeOpacity = useSharedValue(0);
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
  // True once content is taller than the viewport — used to drop
  // justifyContent:'flex-end' from contentContainerStyle which otherwise
  // forces a double-measure pass on every content size change.
  const [isContentTaller, setIsContentTaller] = useState(false);
  // Single-flight RAF guard for stickToEnd: at most one scrollToOffset per frame
  // even when onContentSizeChange fires rapidly during streaming.
  const scrollPendingRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  // Stores the freshest contentH seen since the last RAF fired. Written on every
  // onContentSizeChange call so the coalesced RAF always scrolls to the real bottom
  // rather than the first (potentially stale/smaller) reported height.
  const pendingContentHRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Dev-only list performance instrumentation.
  // Enable with: EXPO_PUBLIC_DEBUG_LIST_PERF=1 npx expo start
  // Logs per-commit content-size change, elapsed ms, and the inferred reason
  // (streaming / session-swap / history-load) so slow commits can be triaged.
  // ---------------------------------------------------------------------------
  const perfRef = useRef<{
    lastContentH: number;
    lastTs: number;
    reason: 'stream' | 'session-swap' | 'history' | 'unknown';
  } | null>(null);
  const prevSessionKeyForPerfRef = useRef(sessionKey);

  // Show the activity row only when there's an active session activity AND
  // there's no streaming bubble already showing typing dots in the message list.
  const isResetting = activity?.reason === 'resetting';
  const hasStreamingBubble = !isResetting && messages.some((m) => m.isStreaming);
  const activityLabel =
    activity?.label ??
    (activity?.reason === 'resetting'
      ? t('chat.session.resetActivity')
      : activity?.reason === 'compacting'
        ? t('chat.activity.compacting')
        : activity?.reason === 'agentBusy'
          ? t('chat.activity.working')
          : undefined);
  const showActivityRow = !!activity && !hasStreamingBubble;

  const prevCountRef = useRef(messages.length);

  // Track whether newly mounted cells should animate in (refs declared here;
  // the actual per-render detection runs after `ordered` is computed below).
  const suppressEnteringRef = useRef(false);
  const suppressEnteringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOrderedIdsRef = useRef<string[]>([]);

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
  // Smoothly fade the top edge gradient when crossing the trigger threshold —
  // identical to the prior `opacity: showTopFade ? 1 : 0` toggle but without
  // the per-frame React commit. `withTiming` applies a 150ms tween only on
  // the value transition, so steady-state scrolling does no extra work.
  const topFadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(topFadeOpacity.value, { duration: 150 }),
  }));

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      if (scrollPendingRef.current !== null) {
        cancelAnimationFrame(scrollPendingRef.current);
        scrollPendingRef.current = null;
      }
      if (suppressEnteringTimerRef.current) {
        clearTimeout(suppressEnteringTimerRef.current);
        suppressEnteringTimerRef.current = null;
      }
      if (newTurnRafRef.current !== null) {
        cancelAnimationFrame(newTurnRafRef.current);
        newTurnRafRef.current = null;
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
  const onReplyToPromptRef = useRef(onReplyToPrompt);
  onReplyToPromptRef.current = onReplyToPrompt;
  const onAnnotateRef = useRef(onAnnotate);
  onAnnotateRef.current = onAnnotate;
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

  // Bulk-load detection: compare ordered ids against the previous render.
  // Runs synchronously in the render body so suppressEnteringRef is set before
  // any cell mounts, ensuring the flag is visible to renderItem on this cycle.
  {
    const currentIds = ordered.map((m) => m.id);
    const prevIds = prevOrderedIdsRef.current;
    const changed =
      currentIds.length !== prevIds.length ||
      currentIds.some((id, i) => id !== prevIds[i]);
    if (changed) {
      prevOrderedIdsRef.current = currentIds;
      const prevSet = new Set(prevIds);
      const newIds = currentIds.filter((id) => !prevSet.has(id));
      // "Fresh" = exactly one new message appended at the tail (a new chat turn).
      // Anything else (bulk prepend, session swap, multiple new) = bulk load → suppress.
      const isSingleTailAppend =
        newIds.length === 1 &&
        currentIds[currentIds.length - 1] === newIds[0] &&
        currentIds.length === prevIds.length + 1;
      if (!isSingleTailAppend) {
        suppressEnteringRef.current = true;
        if (suppressEnteringTimerRef.current) {
          clearTimeout(suppressEnteringTimerRef.current);
        }
        suppressEnteringTimerRef.current = setTimeout(() => {
          suppressEnteringRef.current = false;
          suppressEnteringTimerRef.current = null;
        }, 350);
      } else {
        suppressEnteringRef.current = false;
      }
    }
  }

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
    // Yield to an active user gesture so dragging up takes effect on the first
    // pixel of motion without fighting the auto-scroll. The forced path (reset
    // snap) bypasses this so /reset always lands on the marker.
    if (isUserScrollingRef.current && !forced) return;
    // Always latch the freshest contentH so the coalesced RAF reads the real
    // bottom even if onContentSizeChange fires a second time (FlashList two-pass
    // estimate → actual, or FadeInUp layout settle) while the RAF is queued.
    pendingContentHRef.current = contentH;
    // Coalesce: if a scroll is already scheduled for this frame, the updated
    // pendingContentHRef will be picked up when the RAF fires — no extra work.
    if (scrollPendingRef.current !== null) return;
    scrollPendingRef.current = requestAnimationFrame(() => {
      scrollPendingRef.current = null;
      // Re-check: the user may have started scrolling up between when this RAF
      // was scheduled and when it fires (e.g. a drag began on the same frame
      // as a streaming chunk). Without this the scroll fires on stale state.
      if (!forced && (!pinnedToBottomRef.current || isUserScrollingRef.current)) return;
      const lh = layoutHRef.current;
      const ch = pendingContentHRef.current;
      listRef.current?.scrollToOffset({ offset: Math.max(0, ch - lh), animated: false });
    });
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
    setIsContentTaller(false);
    prevCountRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // When isResetting transitions, force-snap to the end so the reset marker
  // and activity row are visible. Bypasses pinnedToBottomRef — the user
  // couldn't have intentionally scrolled away since /reset is synchronous.
  const resetSnapRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  // RAF handle for the "new turn arrived" double-frame scroll (typing bubble).
  const newTurnRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
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

  // Explicit "new turn arrived" scroll: fires when the typing-bubble placeholder
  // is appended (lastId changes) or when the activity state transitions (e.g.
  // awaiting → streaming). onContentSizeChange-driven stickToEnd handles the
  // common case, but FlashList's two-pass layout and the FadeInUp entering
  // animation can produce a second content-size event whose scroll is coalesced
  // away if the RAF from the first event is still pending. Two consecutive frames
  // ensures we land after both measure passes settle.
  //
  // Guards mirror the other scroll owners so nothing regresses:
  //   - skeleton/session-swap: skeletonActiveRef owns the scroll, bail.
  //   - /reset: resetSnapRafRef owns the scroll, bail.
  //   - user scrolled up: pinnedToBottomRef.current false → bail (pill shows).
  //   - active drag: isUserScrollingRef.current true → bail (re-checked in RAF2).
  //   - streaming chunks: lastId unchanged during a stream → no fire.
  useEffect(() => {
    if (skeletonActiveRef.current) return;
    if (isResettingRef.current) return;
    if (!pinnedToBottomRef.current || isUserScrollingRef.current) return;

    const r1 = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
      const r2 = requestAnimationFrame(() => {
        if (!pinnedToBottomRef.current || isUserScrollingRef.current) return;
        listRef.current?.scrollToEnd({ animated: false });
      });
      newTurnRafRef.current = r2;
    });
    newTurnRafRef.current = r1;
    return () => {
      if (newTurnRafRef.current !== null) {
        cancelAnimationFrame(newTurnRafRef.current);
        newTurnRafRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, activity?.reason]);

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
      // Keep listOpacity at 1: the list is empty so its content is invisible
      // anyway. Leaving listOpacity=0 here causes a stuck transparent list when
      // messages later arrive *without* triggering another sessionChanged event
      // (e.g. demo cold-start disk hydration resolves after the key change).
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

  // Defensive clear: if the parent's isLoading prop drops while skeletonActive is
  // still true (e.g. loadHistory threw, or the session is legitimately empty), fade
  // out the overlay so it doesn't stay on top of the empty FlatList indefinitely.
  // Also restore listOpacity to 1 in case an earlier empty-session-change path left
  // it set (pre-fix3a residual) or a future code path zeros it without messages.
  useEffect(() => {
    if (isLoading || !skeletonActiveRef.current) return;
    skeletonOpacity.value = withTiming(0, { duration: 120 });
    listOpacity.value = withTiming(1, { duration: 120 });
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      skeletonActiveRef.current = false;
      setSkeletonActive(false);
      transitionTimerRef.current = null;
    }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, skeletonOpacity, listOpacity]);

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

      const wantTopFade = y > 10 ? 1 : 0;
      if (topFadeOpacity.value !== wantTopFade) {
        topFadeOpacity.value = wantTopFade;
      }

      // Once content overflows the viewport, disable the flex-end anchor — it's
      // only needed for short lists (iMessage-style bottom alignment).
      if (!isContentTaller && ch > lh + 4) {
        setIsContentTaller(true);
      }

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
    [setPinnedToBottom, topFadeOpacity, isContentTaller],
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

      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_LIST_PERF === '1') {
        const now = performance.now();
        const sessionChanged = prevSessionKeyForPerfRef.current !== sessionKey;
        prevSessionKeyForPerfRef.current = sessionKey;
        const prev = perfRef.current;
        const reason = sessionChanged
          ? 'session-swap'
          : prev && h < prev.lastContentH + 50
            ? 'history'
            : 'stream';
        if (prev) {
          const dt = Math.round(now - prev.lastTs);
          const delta = Math.round(h - prev.lastContentH);
          // eslint-disable-next-line no-console
          console.log(
            `[ListPerf] contentH=${Math.round(h)} delta=+${delta}px dt=${dt}ms reason=${reason} pinned=${pinnedToBottomRef.current}`,
          );
        }
        perfRef.current = { lastContentH: h, lastTs: now, reason };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stickToEnd, sessionKey],
  );

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      layoutHRef.current = e.nativeEvent.layout.height;
      // Also try to stick on layout changes (e.g. keyboard open/close).
      // Skip when the user has a finger on the list — the keyboard-collapse
      // layout cascade after defocus should not yank the view back to the
      // bottom while a drag is already in progress.
      if (pinnedToBottomRef.current && !isUserScrollingRef.current) {
        listRef.current?.scrollToEnd({ animated: false });
      }
    },
    [],
  );

  // Stable refs for hoisted context values so the renderItem closure (which has
  // an empty dep array) always reads the latest values without re-creating itself.
  const filesRef = useRef(files);
  filesRef.current = files;
  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const markdownStylesRef = useRef(markdownStyles);
  markdownStylesRef.current = markdownStyles;
  const orderedRef = useRef(messages);
  orderedRef.current = messages;

  // Registry that maps annotation IDs → their rendered View nodes.
  // Owned here so useImperativeHandle can read it synchronously without
  // going through context (which isn't available at hook call-site).
  const annotationRegistry = useCreateAnnotationLayoutRegistry();

  // Track keyboard height so revealSectionForAnnotation can position the
  // scroll correctly when the keyboard is open.
  const keyboardHRef = useRef(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardHRef.current = e.endCoordinates.height;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHRef.current = 0;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Expose scroll-to-message / scroll-to-annotation for external callers.
  useImperativeHandle(messageListRef, () => ({
    scrollToMessageId(id: string): void {
      const idx = orderedRef.current.findIndex((m) => m.id === id);
      if (idx === -1) return;
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 32 });
    },
    scrollToAnnotationId(annotationId: string, messageId: string): void {
      const rowView = annotationRegistry.getRef(annotationId);
      if (rowView) {
        // getNativeScrollRef returns the actual native scroll view node that
        // measureLayout requires. getScrollResponder() returns a JS mixin
        // instance (not a host component) and causes a warning.
        const scrollNode = listRef.current?.getNativeScrollRef?.();
        if (scrollNode) {
          rowView.measureLayout(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scrollNode as any,
            (_x: number, y: number) => {
              listRef.current?.scrollToOffset({ offset: Math.max(0, y - 24), animated: true });
            },
            () => {
              // measureLayout failed (e.g. node detached) — fall back to cell.
              const idx = orderedRef.current.findIndex((m) => m.id === messageId);
              if (idx !== -1) {
                listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 32 });
              }
            },
          );
          return;
        }
      }
      // Row not yet mounted (virtualized off-screen): scroll to message cell,
      // then retry the precise measure on the next frame once the cell renders.
      const idx = orderedRef.current.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 32 });
        requestAnimationFrame(() => {
          const retryView = annotationRegistry.getRef(annotationId);
          const retryScroll = listRef.current?.getNativeScrollRef?.();
          if (retryView && retryScroll) {
            retryView.measureLayout(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              retryScroll as any,
              (_x: number, y: number) => {
                listRef.current?.scrollToOffset({ offset: Math.max(0, y - 24), animated: true });
              },
              () => { /* silent fallback already at message cell */ },
            );
          }
        });
      }
    },
    revealSectionForAnnotation(annotationId: string, messageId: string): void {
      revealSectionRef.current(annotationId, messageId);
    },
  // annotationRegistry callbacks are stable (created with useCallback/useRef)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [annotationRegistry]);

  // Stable ref so renderItem can call revealSectionForAnnotation without
  // needing it in the dep array (which would recreate the closure on every
  // keyboard event). The ref is kept in sync via useEffect below.
  const revealSectionRef = useRef<(annotationId: string, messageId: string) => void>(
    () => { /* noop until imperative handle is wired */ },
  );
  useEffect(() => {
    revealSectionRef.current = (annotationId: string, messageId: string) => {
      const scrollNode = listRef.current?.getNativeScrollRef?.();
      const rowView = annotationRegistry.getRef(annotationId);

      const doMeasure = (view: ReturnType<typeof annotationRegistry.getRef>): void => {
        if (!view || !scrollNode) return;
        view.measureLayout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scrollNode as any,
          (_x: number, y: number, _w: number, h: number) => {
            const visibleH = layoutHRef.current;
            const kbH = keyboardHRef.current > 0 ? keyboardHRef.current : visibleH * 0.45;
            const target = y + h - (visibleH - kbH - 16);
            listRef.current?.scrollToOffset({ offset: Math.max(0, target), animated: true });
          },
          () => {
            const idx = orderedRef.current.findIndex((m) => m.id === messageId);
            if (idx !== -1) {
              listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 32 });
            }
          },
        );
      };

      if (rowView && scrollNode) {
        doMeasure(rowView);
        return;
      }

      const idx = orderedRef.current.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 32 });
        requestAnimationFrame(() => {
          doMeasure(annotationRegistry.getRef(annotationId));
        });
      }
    };
  // annotationRegistry is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationRegistry]);

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
          onReplyToPrompt={onReplyToPromptRef.current}
          onAnnotate={onAnnotateRef.current}
          annotateMode={annotateMessageId === item.id}
          highlightedAnnotationId={highlightedAnnotationId}
          animateOnMount={!suppressEnteringRef.current}
          files={filesRef.current}
          onOpenFile={openFileRef.current}
          colors={colorsRef.current}
          markdownStyles={markdownStylesRef.current}
          onCommentFocus={revealSectionRef.current}
        />
      );
    },
    // annotateMessageId and highlightedAnnotationId must be deps so React.memo
    // on MessageBubble sees the new props when they change. Other values are
    // stable refs read at call time, so they don't need to be in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [annotateMessageId, highlightedAnnotationId],
  );

  const keyExtractor = useCallback((item: ChatUiMessage) => item.id, []);

  // FlashList recycle pool selector — keeps separate pools for info markers,
  // internalEvent cards, and user/assistant bubbles so cells only recycle
  // within visually compatible types.
  const getItemType = useCallback((item: ChatUiMessage): string => {
    if (item.kind === 'info') return 'info';
    if (item.kind === 'internalEvent') return 'internalEvent';
    return item.role === 'user' ? 'bubble:user' : 'bubble:assistant';
  }, []);

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

      <Animated.View
        pointerEvents="none"
        style={[styles.topFade, topFadeAnimatedStyle]}
      >
        <LinearGradient
          colors={[hexToRgba(colors.background, 0.65), hexToRgba(colors.background, 0)]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {isLoading && messages.length === 0 ? (
        <MessageListSkeleton />
      ) : !isLoading && messages.length === 0 && !skeletonActive && emptyStateSlot ? (
        emptyStateSlot
      ) : (
        <View style={styles.stack}>
          <AnnotationLayoutProvider value={annotationRegistry}>
          <Animated.View style={[styles.flex, listAnimatedStyle]}>
            {USE_FLASH_LIST ? (
              <FlashList
                ref={listRef as React.RefObject<FlashListRef<ChatUiMessage>>}
                data={ordered}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                getItemType={getItemType}
                estimatedItemSize={120}
                extraData={[annotateMessageId, highlightedAnnotationId]}
                onScroll={onScroll}
                onScrollBeginDrag={onScrollBeginDrag}
                onScrollEndDrag={onScrollEndDrag}
                onMomentumScrollEnd={onMomentumScrollEnd}
                scrollEventThrottle={16}
                onContentSizeChange={onContentSizeChange}
                onLayout={onLayout}
                ItemSeparatorComponent={ItemSep}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={
                  isContentTaller ? styles.listContentTall : styles.listContent
                }
                // FlashList v2 chat-style anchoring:
                //  - startRenderingFromBottom: initial render lands at the
                //    bottom of the list — no manual scrollToEnd needed, so
                //    the cell-mount JS work no longer races with programmatic
                //    scroll dispatches that drove the "slow to update" warning.
                //  - autoscrollToBottomThreshold: FlashList treats this as a
                //    fraction of the visible viewport (not pixels), so small
                //    values like 0.05 mean "within 5% of the bottom". Passing
                //    a pixel value like NEAR_BOTTOM (80) would be interpreted
                //    as 80×viewport ≈ the entire list, causing snap-back from
                //    anywhere when any content size changes after a 100ms pause.
                //  - history-load case: keep MVCP enabled so prepended older
                //    messages don't shift the viewport.
                maintainVisibleContentPosition={{
                  startRenderingFromBottom: true,
                  autoscrollToBottomThreshold: 0.05,
                  animateAutoScrollToBottom: false,
                  ...(historyLoading ? { autoscrollToTopThreshold: 0 } : {}),
                }}
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
            ) : (
              <FlatList
                ref={listRef as React.RefObject<FlatList<ChatUiMessage>>}
                data={ordered}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                extraData={[annotateMessageId, highlightedAnnotationId]}
                onScroll={onScroll}
                onScrollBeginDrag={onScrollBeginDrag}
                onScrollEndDrag={onScrollEndDrag}
                onMomentumScrollEnd={onMomentumScrollEnd}
                scrollEventThrottle={16}
                onContentSizeChange={onContentSizeChange}
                onLayout={onLayout}
                contentContainerStyle={isContentTaller ? styles.listContentTall : styles.listContent}
                ItemSeparatorComponent={ItemSep}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                // Wider virtualization window keeps more recently-viewed cells
                // alive off-screen so scrolling back and forth through a long
                // history doesn't pay the full markdown + syntax-highlight
                // mount cost on each return. Smaller per-batch ceiling spreads
                // bulk-mount work across more frames so an inbound batch doesn't
                // park the JS thread for one big spike. The markdown AST cache
                // (src/utils/markdownCache.ts) makes the mounts that DO happen
                // cheap, but reducing how often they happen is the bigger win.
                initialNumToRender={8}
                maxToRenderPerBatch={5}
                updateCellsBatchingPeriod={50}
                windowSize={11}
                removeClippedSubviews
                // Only enable MVCP while a history RPC is in-flight. It prevents
                // prepended older messages from shifting the viewport when the user
                // is scrolled up reading history. Disabled at all other times (esp.
                // during streaming) to avoid the iOS double-measure overhead on every
                // onContentSizeChange.
                maintainVisibleContentPosition={
                  historyLoading ? { minIndexForVisible: 0 } : undefined
                }
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
            )}
          </Animated.View>
          {skeletonActive ? (
            <Animated.View
              style={[StyleSheet.absoluteFill, skeletonAnimatedStyle]}
              pointerEvents="none"
            >
              <MessageListSkeleton />
            </Animated.View>
          ) : null}
          </AnnotationLayoutProvider>
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
});

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
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    // Push short content (e.g. just the reset marker + activity footer) to the
    // bottom of the viewport — iMessage style. flexGrow:1 makes the container
    // fill the viewport when content is shorter; justifyContent:flex-end aligns
    // the items (and ListFooterComponent) to the bottom of that space.
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  // Once content overflows the viewport, drop justifyContent:'flex-end' and
  // flexGrow:1. For long lists these cause an extra full-height measure pass on
  // every content-size change (streaming). Visual effect is identical when
  // contentH > layoutH, so this is a free perf win on long chats.
  listContentTall: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
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
