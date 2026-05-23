import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  type ListRenderItem as RNListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem as FlashListRenderItem } from '@shopify/flash-list';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { useKeyboardHandler } from 'react-native-keyboard-controller';

// FlashList is on by default. Set EXPO_PUBLIC_USE_FLASH_LIST=0 in .env.local
// and restart Metro to fall back to FlatList for debugging.
const USE_FLASH_LIST = process.env.EXPO_PUBLIC_USE_FLASH_LIST !== '0';
import Animated, {
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
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

import { AudioPlayingPill } from './AudioPlayingPill';
import { FileAttachmentCard } from './FileAttachmentCard';
import { InternalEventCard } from './InternalEventCard';
import { MediaEmbed } from './MediaEmbed';
import { MessageBubble } from './MessageBubble';
import { MessageListSkeleton } from './MessageListSkeleton';
import { BrandLoader } from '@/components/common/BrandLoader';
import { StreamingText } from './StreamingText';
import { AnnotationLayoutProvider, useCreateAnnotationLayoutRegistry, SectionLayoutProvider, useCreateSectionLayoutRegistry } from './AnnotationLayoutContext';
import { useIsAnnotationDraftActive } from '@/contexts/AnnotationDraftContext';
import { computeBottomSpacer } from './computeBottomSpacer';
import { InfoMarker } from './InfoMarker';
import { ApprovalCard } from './ApprovalCard';
import type { ExecApprovalDecision } from '@/lib/openclaw/nodes';
import { derivePillState } from './pillState';
import { shouldFirePinLatch, type PinLatch } from './pinToBottom';
import { computeSendScrollTarget } from './sendScrollTarget';

const ITEM_GAP = 16;
// Bottom of the list is partially covered by `pillsWrap` (scroll-to-bottom chip +
// audio pill stack). `revealSectionForAnnotation` must reserve this much space
// above the visible fold so inline comment fields are not hidden behind it.
const COMMENT_REVEAL_PILL_OBSTRUCTION = Spacing.lg + 52 + Spacing.sm + 16;
// In annotation mode the scroll-to-bottom pill is hidden, so only a small bottom
// buffer is needed when revealing the message's annotation chrome.
// TODO: source from measured InputBar height once a height context exists.
const ANNOTATION_REVEAL_OFFSET = Spacing.lg + Spacing.md;

// contentInset.bottom while annotationFocusActive. Extends the legal scroll
// range so iOS UIScrollView doesn't clamp contentOffset when chrome collapse
// briefly grows viewport past contentH. Sized > worst-case chrome growth
// (~84px observed) with safety margin. Reverts to undefined on focus exit.
// Stays SMALL (120, not 500) — larger insets cause iOS to auto-adjust
// contentOffset on inset apply (observed Δ+396 jump pre-Path B with 500).
// The Done-flow Δ-332 clamp is handled separately via the focus-exit
// animated scroll below — inset doesn't try to absorb it.
const FOCUS_MODE_CONTENT_INSET = { bottom: 120 } as const;

// Top-fade gradient height — also accounted for by the send-anchor offset so
// a freshly-sent user message clears the fade and shows ~2 lines of prior
// turn above it (the "context band").
const TOP_FADE_HEIGHT = 36;

// Pill activation thresholds (fractions of layoutH).
const NEAR_BOTTOM_FRACTION = 0.15;

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
  /** Called when the user taps Allow/Deny on an exec approval card. */
  onApprovalDecide?: (approvalId: string, decision: ExecApprovalDecision) => void;
  /** Whether the gateway connection is live — disables approval buttons when false. */
  isConnected?: boolean;
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
   * Map from message id to the count of queued annotations for that message.
   * Drives the lit-icon state on MessageBubble when the user is not in annotate mode.
   */
  annotationCountByMessage?: Map<string, number>;
  /**
   * True while a `chat.history` RPC is in-flight for this session
   * (session select or manual refresh). Enables `maintainVisibleContentPosition`
   * on the FlatList during this window so that history prepends don't shift
   * the user's scroll position if they're already scrolled up.
   */
  historyLoading?: boolean;
  /** When true, keeps keyboard open while user drags the list (annotation composer active). */
  suppressKeyboardDismissOnScroll?: boolean;
  /**
   * True when annotation focus mode is active (composer focused, chrome
   * collapsed). Disables FlashList MVCP autoscrollToBottom so chrome-collapse
   * layoutH growth doesn't trigger a tail-anchor scroll right before the
   * Path B reveal scroll fires.
   */
  annotationFocusActive?: boolean;
  /**
   * Native scroll gesture wrapping the FlashList's underlying scroll
   * component. Attached via `renderScrollComponent` so the sibling sidebar
   * `openPan` can compose with the actual `UIScrollView.panGestureRecognizer`
   * via `simultaneousWithExternalGesture`. Without this, the wrapping
   * `<View>` is what gets the native gesture, and the composition does not
   * reach FlashList's scroll recognizer.
   */
  nativeGesture?: GestureType;
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
  /**
   * Scroll the message's bottom edge into view so the annotation chrome
   * (AddComment / SelectRange buttons + inline rows) sits above the InputBar.
   * Call after annotate mode opens for a message to reveal newly-mounted chrome.
   * Defaults to a no-op if the user is already scrolled away from the bottom —
   * don't yank their viewport when they're reading higher up in the conversation.
   * Pass `force: true` to bypass the near-bottom guard when the user explicitly
   * targeted this message (e.g. tapped Annotate on a scrolled-up message).
   */
  revealMessageBottom: (messageId: string, opts?: { force?: boolean }) => void;
  /** Mark composer focused so keyboard worklet re-anchors tail each frame. */
  notifyComposerFocus(): void;
  /** Arm a pending reveal; worklet drives it per-frame as keyboard rises. If keyboard already up, fires once immediately. */
  armPendingReveal(annotationId: string, messageId: string): void;
  /**
   * Scroll to the bottom of the list, but only if the user is already near
   * the bottom. Use after the keyboard appears so the tail stays visible
   * without yanking the viewport when the user is reading earlier content.
   */
  scrollToBottomIfNearBottom: (animated: boolean) => void;
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
  onApprovalDecide,
  isConnected = false,
  annotateMessageId = null,
  highlightedAnnotationId = null,
  annotationCountByMessage,
  emptyStateSlot,
  activity = null,
  sessionKey,
  isSpeaking = false,
  onStopSpeaking,
  historyLoading = false,
  suppressKeyboardDismissOnScroll = false,
  annotationFocusActive = false,
  nativeGesture,
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
  // `scrollToEnd`, `scrollToIndex`) work for both FlatList and FlashList.
  const listRef = useRef<FlatList<ChatUiMessage> | FlashListRef<ChatUiMessage> | null>(null);
  // Animated ref attached to FlashList's underlying scroll view via
  // renderScrollComponent. Used by the worklet-side `scrollTo` call in the
  // Path B useAnimatedReaction. Declared up here so renderScrollComponent
  // (also up here in the function body) can capture it without a hoisting
  // issue. See the UI-thread Path B pipeline comment further below.
  const animatedScrollRef = useAnimatedRef<Animated.ScrollView>();
  // Top-fade opacity is driven directly by a shared value rather than React
  // state so scrolling past the trigger threshold doesn't trigger a list-level
  // commit on every onScroll frame.
  const topFadeOpacity = useSharedValue(0);

  // Track the most recent layoutMeasurement.height (viewport) and the most
  // recent contentSize.height. Both are read by the send-anchor effect and
  // the spacer-size effect.
  const layoutHRef = useRef(0);
  const latestContentHRef = useRef(0);
  const offsetYRef = useRef(0);

  // Pill visibility state. Two independent signals:
  //   - showPill: nav affordance, true whenever the user is scrolled away
  //     from the bottom (no streaming required).
  //   - hasNewMessages: latched when an assistant tail message arrives /
  //     finalizes while the user is away from the bottom — drives the
  //     pulsing dot + "New messages" label.
  const isNearBottomRef = useRef(true);
  const pinToBottomRef = useRef<PinLatch | null>(null);
  const pinToBottomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Session-load pin window — any onContentSizeChange while Date.now() is below
  // this watermark force-scrolls to bottom. Catches FlashList virtualized item
  // measurements settling over multiple frames, where the one-shot pin latch is
  // consumed by the FIRST size event and leaves the list short of bottom when
  // later measurements push contentH up. Cleared on user drag (intent override).
  const pinUntilTsRef = useRef<number>(0);
  const isUserDraggingRef = useRef(false);
  // True once the user has dragged within the current session. Disables the
  // skeletonActiveRef + pinUntilTsRef bypasses in onContentSizeChange so the
  // list never yanks back to bottom mid-read. Reset on sessionKey change.
  const userTookControlRef = useRef(false);
  const unseenContentRef = useRef(false);
  const lastIsAssistantRef = useRef(false);
  const [showPillState, setShowPillState] = useState(false);
  const [hasNewMessagesState, setHasNewMessagesState] = useState(false);
  // True from the moment a fresh user message lands until ~350ms after the
  // send-anchor scrollToOffset fires. Used to hide the activity overlay so it
  // can't appear at the bottom of the viewport before the user message has
  // animated into its anchor band.
  const [sendAnchorPending, setSendAnchorPending] = useState(false);
  const updatePillState = useCallback(() => {
    const next = derivePillState({
      nearBottom: isNearBottomRef.current,
      unseenContent: unseenContentRef.current,
      lastIsAssistant: lastIsAssistantRef.current,
    });
    setShowPillState((prev) => (prev === next.showPill ? prev : next.showPill));
    setHasNewMessagesState((prev) =>
      prev === next.hasNewMessages ? prev : next.hasNewMessages,
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Dev-only list performance instrumentation.
  // Enable with: EXPO_PUBLIC_DEBUG_LIST_PERF=1 npx expo start
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

  // True only when the streaming bubble's tail is actively producing prose text.
  // A completed tool call or thinking block at the tail does NOT count — we want
  // the BrandLoader+SweepingText activity row to stay visible during those gaps.
  const hasActiveStreamingText =
    !isResetting &&
    messages.some((m) => {
      if (!m.isStreaming) return false;
      if (m.parts && m.parts.length > 0) {
        const tail = m.parts[m.parts.length - 1];
        return tail?.kind === 'text' && (tail.text?.trimEnd().length ?? 0) > 0;
      }
      return (m.content?.trimEnd().length ?? 0) > 0;
    });

  const activityLabel =
    activity?.label ??
    (activity?.reason === 'resetting'
      ? t('chat.session.resetActivity')
      : activity?.reason === 'compacting'
        ? t('chat.activity.compacting')
        : activity?.reason === 'agentBusy'
          ? t('chat.activity.working')
          : activity?.reason === 'reconnecting-stream-pending'
            ? t('chat.activity.reconnectingStream')
            : activity?.reason === 'reconciling'
              ? t('chat.activity.reconciling')
              : undefined);
  const showActivityRow = !!activity && !hasActiveStreamingText && !sendAnchorPending;

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
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skeletonActiveRef = useRef(false);

  const listAnimatedStyle = useAnimatedStyle(() => ({ opacity: listOpacity.value }));
  const skeletonAnimatedStyle = useAnimatedStyle(() => ({ opacity: skeletonOpacity.value }));
  // Smooth fade for the top-edge gradient.
  const topFadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(topFadeOpacity.value, { duration: 150 }),
  }));

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      if (suppressEnteringTimerRef.current) {
        clearTimeout(suppressEnteringTimerRef.current);
        suppressEnteringTimerRef.current = null;
      }
      if (sendAnchorRafRef.current !== null) {
        cancelAnimationFrame(sendAnchorRafRef.current);
        sendAnchorRafRef.current = null;
      }
      if (sendAnchorClearTimerRef.current !== null) {
        clearTimeout(sendAnchorClearTimerRef.current);
        sendAnchorClearTimerRef.current = null;
      }
      if (pinToBottomTimerRef.current !== null) {
        clearTimeout(pinToBottomTimerRef.current);
        pinToBottomTimerRef.current = null;
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
  const onApprovalDecideRef = useRef(onApprovalDecide);
  onApprovalDecideRef.current = onApprovalDecide;
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;
  const isResettingRef = useRef(isResetting);
  isResettingRef.current = isResetting;

  // ---------------------------------------------------------------------------
  // Bottom spacer sizing.
  //
  // While the tail of the list is awaiting / receiving an assistant reply,
  // hold a layoutH-tall spacer at the tail so a freshly-sent user message can
  // scroll to the top of the viewport (scrollToIndex viewPosition: 0) even
  // when the assistant reply is too short or the prior history would otherwise
  // pin the user message at the bottom of the viewport.
  // ---------------------------------------------------------------------------
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastIsUser =
    !!lastMsg &&
    lastMsg.role === 'user' &&
    lastMsg.kind !== 'info' &&
    lastMsg.kind !== 'internalEvent' &&
    lastMsg.kind !== 'spacer';
  const needsAnchorSpace = !isResetting && (hasStreamingBubble || lastIsUser);
  const needsAnchorSpaceRef = useRef(needsAnchorSpace);
  needsAnchorSpaceRef.current = needsAnchorSpace;

  const [layoutH, setLayoutH] = useState(0);
  const [activityOverlayH, setActivityOverlayH] = useState(0);
  const spacerHeight = useMemo(
    () => computeBottomSpacer({ needsAnchorSpace, layoutH }),
    [needsAnchorSpace, layoutH],
  );
  const spacerHeightRef = useRef(spacerHeight);
  spacerHeightRef.current = spacerHeight;

  // Mirror of the activity-overlay's extra contribution to listContent
  // paddingBottom. Read by the send-anchor effect so the programmatic scroll
  // offset accounts for the overlay's reserved space (which is part of
  // contentH but not part of the bottom spacer).
  const activityPadExtraRef = useRef(0);
  // Timer that clears sendAnchorPending after the send-anchor scroll has had
  // time to animate into place.
  const sendAnchorClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listContentStyle = useMemo(() => {
    const base = styles.listContent;
    if (!showActivityRow || activityOverlayH <= 0) return base;
    const extra = Spacing.lg + activityOverlayH + Spacing.md;
    return { ...base, paddingBottom: base.paddingBottom + extra };
  }, [showActivityRow, activityOverlayH]);

  useEffect(() => {
    if (!showActivityRow) setActivityOverlayH(0);
  }, [showActivityRow]);

  useEffect(() => {
    activityPadExtraRef.current =
      showActivityRow && activityOverlayH > 0
        ? Spacing.lg + activityOverlayH + Spacing.md
        : 0;
  }, [showActivityRow, activityOverlayH]);

  const userMsgHeightsRef = useRef<Map<string, number>>(new Map());

  const handleUserMsgLayoutRef = useRef((id: string, h: number) => {
    userMsgHeightsRef.current.set(id, h);
  });

  const isEmptyStreamingPlaceholder = (m: ChatUiMessage): boolean =>
    Boolean(m.isStreaming) &&
    m.role === 'assistant' &&
    !m.content?.trim() &&
    !(m.parts && m.parts.length > 0) &&
    !m.images?.length &&
    !m.fileAttachments?.length &&
    !m.files?.length &&
    !m.audioUrl &&
    !m.videoUrl;

  const ordered = useMemo(() => {
    return isResetting
      ? messages.filter((m) => !m.id.startsWith('stream-'))
      : messages.filter((m) => !isEmptyStreamingPlaceholder(m));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isResetting]);

  // Mirrors `ordered` for imperative scroll (reset filtering can differ from raw `messages`).
  const orderedRef = useRef<ChatUiMessage[]>([]);
  orderedRef.current = ordered;

  lastIsAssistantRef.current = ordered[ordered.length - 1]?.role === 'assistant';
  // Track by the LAST rendered message id (ordered tail, not raw messages tail).
  const lastId = ordered[ordered.length - 1]?.id ?? null;

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
  // Send-anchor scroll.
  //
  // The one programmatic scroll in the ChatGPT-style anchor model: when a
  // fresh user message lands at the tail, scroll it near the top of the
  // viewport with a small "context band" above so the prior turn's tail
  // stays visible. After that, the user owns scroll — no auto-follow.
  // ---------------------------------------------------------------------------
  const sendAnchorRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const prevTailUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const target = computeSendScrollTarget(orderedRef.current);
    if (target.userId === prevTailUserIdRef.current) return;
    prevTailUserIdRef.current = target.userId;
    if (target.index < 0) return;
    if (skeletonActiveRef.current) return;
    if (isResettingRef.current) return;

    // New user message → user intent is "anchor my msg near top," not pin to
    // bottom. Close any active session-load pin window so it can't fight the
    // send-anchor scroll if the user submits within the settle window.
    pinUntilTsRef.current = 0;

    // Snapshot pre-send "near bottom" state. Once the new tail msg renders and
    // FlashList re-measures, onContentSizeChange may flip isNearBottomRef to
    // false (the added msg pushes distFromEnd past the 15% threshold) — but
    // intent here is "was the user at the bottom WHEN they sent."
    const wasScrolledUpAtSend = !isNearBottomRef.current;

    // Hide the activity overlay until the send-anchor scroll has settled, so
    // the pill can't appear at the bottom of the viewport before the new user
    // message has animated into its anchor band.
    setSendAnchorPending(true);
    if (sendAnchorClearTimerRef.current !== null) {
      clearTimeout(sendAnchorClearTimerRef.current);
      sendAnchorClearTimerRef.current = null;
    }

    // Three RAFs so FlashList finishes its measure pass before the scroll.
    const bodyLineHeight =
      (markdownStyles.paragraph as { lineHeight?: number } | undefined)?.lineHeight ?? 24;
    const contextBand = Math.round(bodyLineHeight * 3);
    const viewOffset = TOP_FADE_HEIGHT + Spacing.lg + contextBand;
    const indexAtFire = target.index;

    // Cancel any in-flight raf from the previous run before scheduling. Single
    // ref tracks whichever raf handle is currently outstanding so cleanup
    // always cancels the right one — never an orphaned r1 after r2 was set.
    if (sendAnchorRafRef.current !== null) {
      cancelAnimationFrame(sendAnchorRafRef.current);
      sendAnchorRafRef.current = null;
    }
    sendAnchorRafRef.current = requestAnimationFrame(() => {
      sendAnchorRafRef.current = requestAnimationFrame(() => {
        // Snapshot in frame 2 for the "was at bottom" path.
        // User-msg onContentSizeChange has fired by frame 2 (~32ms);
        // a fast-network streaming bubble inflating contentH before
        // frame 3 can't corrupt the formula.
        // For scrolled-up sends (tail off-screen), leave null so frame 3
        // reads fresh — the recycler may not mount+measure until then.
        const contentHSnap    = wasScrolledUpAtSend ? null : latestContentHRef.current;
        const spacerHSnap     = wasScrolledUpAtSend ? null : spacerHeightRef.current;
        const activityPadSnap = wasScrolledUpAtSend ? null : activityPadExtraRef.current;
        sendAnchorRafRef.current = requestAnimationFrame(() => {
          sendAnchorRafRef.current = null;
          const contentH    = contentHSnap    ?? latestContentHRef.current;
          const spacerH     = spacerHSnap     ?? spacerHeightRef.current;
          const activityPad = activityPadSnap ?? activityPadExtraRef.current;
          // contentH includes contentContainerStyle.paddingBottom but spacerH
          // (the ListFooter spacer) sits above that padding. Subtract it so
          // the offset doesn't under-scroll by Spacing.md, which would land
          // the user message ~12px above the intended anchor band.
          const basePadBottom = styles.listContent.paddingBottom;
          const targetId = target.userId;
          const msgH = targetId ? userMsgHeightsRef.current.get(targetId) ?? 0 : 0;

          // Skip scroll when message content doesn't yet overflow the viewport
          // AND the user was already at the bottom (not scrolled into history).
          // contentH is the raw onContentSizeChange height (includes spacerH).
          // Subtracting spacerH gives actual message content height — short
          // chats render at the top of the chat window and skip send-anchor.
          const wasScrolledUp = wasScrolledUpAtSend;
          const effectiveContentH = contentH - spacerH;
          if (!wasScrolledUp && effectiveContentH <= layoutHRef.current) {
            sendAnchorClearTimerRef.current = setTimeout(() => {
              setSendAnchorPending(false);
              sendAnchorClearTimerRef.current = null;
            }, 0);
            unseenContentRef.current = false;
            updatePillState();
            return;
          }

          // scrollToOffset is the primary path. For at-bottom sends, contentH /
          // spacerH are snapshotted in frame 2 (post user-msg layout, pre-streaming)
          // so a fast-network streaming bubble can't inflate the offset and push the
          // user msg above the viewport top. For scrolled-up sends, refs are read
          // fresh here in frame 3 — the off-screen tail needs the full 3-frame
          // window before onContentSizeChange fires with the correct height.
          // scrollToIndex would be conceptually cleaner (identity-keyed on the
          // message) but FlashList 2.0.x no-ops scrollToIndex on freshly-mounted
          // tail items that haven't yet been measured by the recycler, leaving the
          // msg pinned at viewport bottom with no scroll motion. Keep scrollToIndex
          // as a fallback for the measurement-not-ready branch.
          if (contentH > 0 && spacerH > 0) {
            // For scrolled-up sends the new msg is off-screen → FlashList skips
            // onLayout → msgH = 0. Estimate a typical single-line user-bubble
            // height so the formula places msg TOP (not msg END) near viewOffset.
            const ESTIMATED_USER_MSG_H = 80;
            const usedMsgH = msgH > 0 ? msgH : ESTIMATED_USER_MSG_H;
            listRef.current?.scrollToOffset({
              offset: Math.max(0, contentH - spacerH - usedMsgH - viewOffset - activityPad - basePadBottom),
              animated: true,
            });
          } else {
            try {
              listRef.current?.scrollToIndex({
                index: indexAtFire, viewPosition: 0, viewOffset, animated: true,
              });
            } catch {
              listRef.current?.scrollToEnd({ animated: true });
            }
          }
          // Release the activity overlay after the iOS scroll animation has
          // had time to settle (~300ms). The overlay can then render in its
          // final resting position below the user message instead of flashing
          // mid-animation.
          sendAnchorClearTimerRef.current = setTimeout(() => {
            setSendAnchorPending(false);
            sendAnchorClearTimerRef.current = null;
          }, 300);
          // Once we scrolled to the new user message, the user is no longer
          // "away from the bottom" by our latch's definition: they're looking
          // at the freshest content. Clear the unseen latch + suppress the pill
          // until the next assistant chunk arrives below the fold.
          unseenContentRef.current = false;
          updatePillState();
        });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, markdownStyles]);

  const scrollToMessagesEnd = useCallback((animated: boolean) => {
    const spacerH = spacerHeightRef.current;
    if (spacerH > 0) {
      const contentH = latestContentHRef.current;
      const lh = layoutHRef.current;
      if (contentH > 0 && lh > 0) {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, contentH - spacerH - lh),
          animated,
        });
        return;
      }
    }
    listRef.current?.scrollToEnd({ animated });
  }, []);

  const scrollToBottom = useCallback((animated: boolean) => {
    scrollToMessagesEnd(animated);
    unseenContentRef.current = false;
    updatePillState();
  }, [updatePillState, scrollToMessagesEnd]);

  // Arm the pin-to-bottom latch with a bounded lifetime. If
  // `onContentSizeChange` doesn't consume the latch within ~200ms (e.g. the
  // reload returned identical content so no size change fires), the safety
  // timer either scrolls directly (force) or clears the latch (non-force) so
  // it can't leak into an unrelated future content change.
  const armPinToBottom = useCallback((force: boolean) => {
    pinToBottomRef.current = { force };
    if (pinToBottomTimerRef.current !== null) {
      clearTimeout(pinToBottomTimerRef.current);
    }
    pinToBottomTimerRef.current = setTimeout(() => {
      pinToBottomTimerRef.current = null;
      const latch = pinToBottomRef.current;
      if (!latch) return;
      pinToBottomRef.current = null;
      if (latch.force) {
        scrollToMessagesEnd(false);
      }
    }, 200);
  }, [scrollToMessagesEnd]);

  // Reset pill state on session switch and arm the pin-to-bottom latch.
  useEffect(() => {
    // Stale Y from prior session would otherwise pollute onContentSizeChange's
    // distFromEnd math and could flip nearBottom incorrectly before the latch
    // consumes (force latch fires regardless, but pill state can flash).
    offsetYRef.current = 0;
    isNearBottomRef.current = true;
    unseenContentRef.current = false;
    userTookControlRef.current = false;
    setShowPillState(false);
    setHasNewMessagesState(false);
    armPinToBottom(true);
    // Pin window: ride out FlashList's virtualized measurement settling so the
    // final landing position matches the stabilized content height, not the
    // height at the first onContentSizeChange. Extends on each event in
    // onContentSizeChange — closes naturally once content stops shifting.
    pinUntilTsRef.current = Date.now() + 5000;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // Arm pin-to-bottom latch on the RISING edge of historyLoading (manual
  // refresh, cold-start reconcile starting). The latch must be in place
  // BEFORE loadHistory's setState lands so the resulting onContentSizeChange
  // can consume it the same tick. Arming on the falling edge would race past
  // the only content event that would fire it.
  const prevHistoryLoadingRef = useRef(historyLoading);
  useEffect(() => {
    const prev = prevHistoryLoadingRef.current;
    prevHistoryLoadingRef.current = historyLoading;
    if (!prev && historyLoading) {
      armPinToBottom(true);
    }
  }, [historyLoading, armPinToBottom]);

  // On reset transition, snap to the end so the reset marker and activity row
  // are visible.
  const resetSnapRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  useEffect(() => {
    if (!isResetting) return;
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        resetSnapRafRef.current = null;
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
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // Defensive: if the pin-to-bottom latch armed by the sessionKey
        // effect survived two rAFs without onContentSizeChange consuming it
        // (e.g. cached session whose content height matches the previous
        // one), fire the scroll now so the destination isn't left short.
        // Skeleton dismissal is a strong "land at bottom" signal — the user was
        // waiting for initial content. Fire unconditionally on hadSkeleton; also
        // honor a surviving force latch for non-skeleton reload paths.
        if (hadSkeleton || (shouldFade && pinToBottomRef.current?.force)) {
          pinToBottomRef.current = null;
          if (pinToBottomTimerRef.current !== null) {
            clearTimeout(pinToBottomTimerRef.current);
            pinToBottomTimerRef.current = null;
          }
          // Respect user drag: if they grabbed the list while the skeleton was
          // mounted (pointerEvents=none means drags pass through), don't yank
          // them back to bottom now.
          if (!userTookControlRef.current) {
            scrollToMessagesEnd(false);
          }
        }
        if (shouldFade) {
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
            // Geometry can shift after the skeleton overlay unmounts (list
            // becomes the topmost layer). Re-fire the pin so the final landing
            // position matches the now-stable content height, and extend the
            // pin window to catch any further measurement events.
            pinUntilTsRef.current = Math.max(pinUntilTsRef.current, Date.now() + 1500);
            requestAnimationFrame(() => {
              if (userTookControlRef.current) return;
              scrollToMessagesEnd(false);
            });
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

  // Defensive clear: if isLoading drops while skeletonActive is still true,
  // fade out the overlay so it doesn't stay on top of the empty list.
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

  // ---------------------------------------------------------------------------
  // Pill latch: set `unseenContentRef` when a new assistant tail message
  // arrives OR a streaming bubble finalizes (`stream-*` → real id) while the
  // user is scrolled away from the bottom.
  // ---------------------------------------------------------------------------
  const prevCountForPillRef = useRef(messages.length);
  const prevLastIdForPillRef = useRef<string | null>(messages[messages.length - 1]?.id ?? null);
  const messageCount = messages.length;
  useEffect(() => {
    const msgs = messagesRef.current;
    const last = msgs[msgs.length - 1];
    const prev = prevCountForPillRef.current;
    const currentLastId = last?.id ?? null;
    const prevLastIdPill = prevLastIdForPillRef.current;
    prevLastIdForPillRef.current = currentLastId;
    prevCountForPillRef.current = msgs.length;

    if (!last) return;
    if (isNearBottomRef.current) return;
    if (last.role !== 'assistant') return;

    const isNewMessage = msgs.length > prev;
    const isFinalization =
      currentLastId !== prevLastIdPill &&
      prevLastIdPill?.startsWith('stream-') === true &&
      currentLastId !== null &&
      !currentLastId.startsWith('stream-');
    if (isNewMessage || isFinalization) {
      unseenContentRef.current = true;
      updatePillState();
    }
  // messagesRef.current is read at effect time; lastId + messageCount cover
  // the two state transitions we care about (new tail message, finalization).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, messageCount, updatePillState]);

  // Arm pin-to-bottom (non-force) when a status message arrives at the tail.
  // Consumed by onContentSizeChange after the new height is measured.
  const prevCountForStatusRef = useRef<number>(messages.length);
  const prevLastIdForStatusRef = useRef<string | null>(messages[messages.length - 1]?.id ?? null);
  useEffect(() => {
    const msgs = messagesRef.current;
    const last = msgs[msgs.length - 1];
    const prev = prevCountForStatusRef.current;
    const currentLastId = last?.id ?? null;
    const prevLastId = prevLastIdForStatusRef.current;
    prevCountForStatusRef.current = msgs.length;
    prevLastIdForStatusRef.current = currentLastId;

    if (!last) return;
    const isNewTail = msgs.length > prev || currentLastId !== prevLastId;
    if (!isNewTail) return;

    const isStatus = last.kind === 'info';
    if (isStatus) {
      armPinToBottom(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, messageCount, armPinToBottom]);

  // Inject Animated.ScrollView so we can attach an animated ref for the
  // UI-thread scrollTo worklet (see useAnimatedReaction further below).
  // FlashList passes its own internal ref via scrollProps.ref; merge so
  // FlashList's scrollToOffset / getNativeScrollRef keep working.
  const renderScrollComponent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (scrollProps: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ref: flashListInternalRef, ...rest } = scrollProps;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergedRef = (node: any) => {
        // AnimatedRef from useAnimatedRef is callable; invoking it triggers
        // Reanimated's native-tag capture used by scrollTo worklet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (animatedScrollRef as any)(node);
        if (typeof flashListInternalRef === 'function') {
          flashListInternalRef(node);
        } else if (flashListInternalRef) {
          flashListInternalRef.current = node;
        }
      };
      const scrollView = <Animated.ScrollView {...rest} ref={mergedRef} />;
      return nativeGesture ? (
        <GestureDetector gesture={nativeGesture}>{scrollView}</GestureDetector>
      ) : (
        scrollView
      );
    },
    [animatedScrollRef, nativeGesture],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const ch = e.nativeEvent.contentSize.height;
      const lh = e.nativeEvent.layoutMeasurement.height;
      const prevY = offsetYRef.current;
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1' && Math.abs(y - prevY) > 1) {
        // eslint-disable-next-line no-console
        console.log(`[Scroll] offsetY ${Math.round(prevY)} → ${Math.round(y)} (Δ${Math.round(y-prevY)}) lh=${Math.round(lh)} ch=${Math.round(ch)} ts=${Date.now() % 100000}`);
      }
      offsetYRef.current = y;

      const wantTopFade = y > 10 ? 1 : 0;
      if (topFadeOpacity.value !== wantTopFade) {
        topFadeOpacity.value = wantTopFade;
      }

      const realContentH = ch - spacerHeightRef.current;
      const distFromEnd = realContentH - lh - y;
      const nearBottom = distFromEnd < lh * NEAR_BOTTOM_FRACTION;
      const nearBottomChanged = nearBottom !== isNearBottomRef.current;
      if (nearBottomChanged) {
        isNearBottomRef.current = nearBottom;
        if (nearBottom) {
          unseenContentRef.current = false;
        }
        updatePillState();
      }
    },
    [topFadeOpacity, updatePillState],
  );

  // MVCP gating:
  //  - historyLoading: top-pin prepended older messages.
  //  - needsAnchorSpace (lastIsUser or assistant streaming): disable bottom
  //    auto-pin (-1 sentinel) so MVCP doesn't fight send-anchor or pull the
  //    list past the user message when the streaming bubble lands in the
  //    same render pass. Trade-off: during a stream the user must drag
  //    manually to follow the tail.
  //  - else: 1px auto-pin lets FlashList keep the tail glued through
  //    settle-time reflows (markdown, code highlight, image load).
  const flashListMvcp = useMemo(() => {
    if (historyLoading) return { autoscrollToTopThreshold: 0 };
    if (needsAnchorSpace) return { autoscrollToBottomThreshold: -1 };
    // Annotation focus mode: chrome collapse grows layoutH ~84px BEFORE kb
    // begins rising. FlashList's MVCP autoscroll would re-anchor tail on
    // windowHeight change — disabled by setting threshold to -1 (the patched
    // runAutoScrollToBottomCheck honors live threshold). The other half of
    // the fix is FOCUS_MODE_CONTENT_INSET, which extends iOS's legal scroll
    // range so the native UIScrollView clamp doesn't fire either.
    //
    if (annotationFocusActive) return { autoscrollToBottomThreshold: -1 };
    return { autoscrollToBottomThreshold: 1 };
  }, [historyLoading, needsAnchorSpace, annotationFocusActive]);

  const onScrollBeginDrag = useCallback(() => {
    isUserDraggingRef.current = true;
    // User took manual control — abandon any session-load pin window AND
    // disable the skeleton-active bypass so we don't yank them back to bottom
    // mid-read once finger lifts. userTookControlRef resets on sessionKey
    // change so the next session swap re-arms cleanly.
    pinUntilTsRef.current = 0;
    userTookControlRef.current = true;
  }, []);
  const onScrollEndDrag = useCallback(() => { isUserDraggingRef.current = false; }, []);

  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      latestContentHRef.current = h;

      const realH = h - spacerHeightRef.current;
      const newDistFromEnd = realH - layoutHRef.current - offsetYRef.current;
      const newNearBottom = newDistFromEnd < layoutHRef.current * NEAR_BOTTOM_FRACTION;
      const nearBottomChanged = newNearBottom !== isNearBottomRef.current;
      if (nearBottomChanged) {
        isNearBottomRef.current = newNearBottom;
        if (newNearBottom) unseenContentRef.current = false;
      }

      // Don't scroll while the user has a finger down — fighting an active drag
      // causes jank. Leave pinToBottomRef set so the next onContentSizeChange
      // (after finger lift) can still fire.
      const userDragging = isUserDraggingRef.current;
      const latchFires = !userDragging && shouldFirePinLatch(pinToBottomRef.current, isNearBottomRef.current);
      // Skeleton-active bypass: while the skeleton overlay is mounted, every
      // onContentSizeChange should re-pin regardless of the time-based pin
      // window. Slow data arrivals (observed dt=2704ms) outlast the window;
      // user can't see the list anyway, so post-fade landing must be at bottom.
      // userTookControlRef disables both bypasses once the user has dragged
      // within this session — never yank them back to bottom mid-read.
      const inPinWindow = !userDragging && !userTookControlRef.current && (
        Date.now() < pinUntilTsRef.current || skeletonActiveRef.current
      );

      if (latchFires) {
        pinToBottomRef.current = null;
        if (pinToBottomTimerRef.current !== null) {
          clearTimeout(pinToBottomTimerRef.current);
          pinToBottomTimerRef.current = null;
        }
      }

      // Suppress streaming-driven tail-pin when an annotation reveal is armed.
      // Add Comment flow targets the annotation row, not the chat tail; firing
      // scrollToMessagesEnd here would yank the chat to bottom right before the
      // kb rise / Path B scroll, producing a visible pre-kb scroll.
      const revealArmed = pendingRevealRef.current !== null;
      if ((latchFires || inPinWindow) && !revealArmed) {
        scrollToMessagesEnd(false);
        // Skip pill state update — the snap fires onScroll which updates
        // isNearBottomRef + pill authoritatively. Updating here too would
        // flash the pill on (newNearBottom=false from pre-snap offset) then
        // off (post-snap onScroll).
      } else if (nearBottomChanged) {
        updatePillState();
      }

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
            `[ListPerf] contentH=${Math.round(h)} delta=+${delta}px dt=${dt}ms reason=${reason}`,
          );
        }
        perfRef.current = { lastContentH: h, lastTs: now, reason };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionKey, updatePillState, scrollToMessagesEnd],
  );

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      const prev = layoutHRef.current;
      layoutHRef.current = h;
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1' && prev !== h) {
        // eslint-disable-next-line no-console
        console.log(`[Layout] layoutH ${Math.round(prev)} → ${Math.round(h)} (Δ${Math.round(h-prev)}) ts=${Date.now() % 100000}`);
      }
      // Track post-chrome-collapse peak inline. Worklet's per-frame max-track
      // can miss the peak if onLayout fires multiple times between worklet
      // frames (e.g., chrome shrink → KAV push happens silently between two
      // worklet ticks → worklet only sees post-push value). Capturing here
      // guarantees we see every layout transition.
      if (
        baselineLayoutHRef.current > 0 &&
        h > baselineLayoutHRef.current
      ) {
        baselineLayoutHRef.current = h;
      }
      // Mirror baselineLayoutHRef as a SharedValue for the worklet-side Path B
      // reaction. Track max(h, prevSV) so chrome growth post-arm is captured.
      // Read by the reaction to compute the post-chrome pre-kb viewport.
      // Resets to 0 in clearKeyboardBaseline (on onEnd).
      if (h > baseLhSV.value) {
        baseLhSV.value = h;
      }
      // setLayoutH triggers a MessageList re-render. The state is consumed only
      // by spacerHeight useMemo, which evaluates to 0 when needsAnchorSpace=false.
      // Skip the re-render in that case: it would just recompute spacer=0 and
      // burn JS thread cycles. During kb-animation onLayouts (KAV padding +
      // chrome collapse fire many in succession), saturating JS starves the
      // worklet's runOnJS scroll calls — the Path B "delayed scroll after kb"
      // symptom. Sync state back to ref when needsAnchorSpace flips true (effect
      // below) so spacer math is fresh when it actually matters.
      if (needsAnchorSpaceRef.current) {
        setLayoutH(h);
      }
    },
    [],
  );

  useEffect(() => {
    if (needsAnchorSpace) {
      setLayoutH(layoutHRef.current);
    }
  }, [needsAnchorSpace]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // FlatList fallback path: estimate the offset and try again on the next frame.
      const approxOffset = info.index * info.averageItemLength;
      listRef.current?.scrollToOffset({ offset: approxOffset, animated: true });
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

  // Registry that maps annotation IDs → their rendered View nodes.
  const annotationRegistry = useCreateAnnotationLayoutRegistry();
  // Registry that maps `${messageId}::${sectionIndex}` → SectionBlock View nodes.
  const sectionRegistry = useCreateSectionLayoutRegistry();

  /** While set, `keyboardDidShow` re-runs reveal scroll after layout settles. */
  const pendingRevealRef = useRef<{ annotationId: string; messageId: string } | null>(null);

  // Track keyboard height so revealSectionForAnnotation can position the
  // scroll correctly when the keyboard is open.
  const keyboardHRef = useRef(0);
  const composerFocusFlagRef = useRef(false);
  // Frozen pre-kb-rise, post-chrome-collapse layoutH. Captured at arm time and
  // monotonically increased per worklet frame as layoutH grows (chrome collapse
  // expands FlashList's measured height). Never shrinks — kb starts pushing
  // layoutH back down, which would otherwise clobber the post-collapse peak.
  // Used only as a GATE for Path B firing (must exceed armBaseLayoutHRef so
  // chrome-collapse peak is captured before scrolling begins). Per-frame Path B
  // math uses the live layoutHRef, not this baseline.
  const baselineLayoutHRef = useRef(0);
  // Arm-time layoutH snapshot. Path B fires only after baselineLayoutHRef has
  // grown past this (i.e., chrome-collapse peak captured). Without this guard,
  // an onStart frame where KAV had already partially padded would fire Path B
  // prematurely with the pre-chrome baseline.
  const armBaseLayoutHRef = useRef(0);
  const cachedRevealMeasureRef = useRef<{ y: number; h: number } | null>(null);
  // Same payload as cachedRevealMeasureRef, but persists past onEnd. Consumed
  // by the post-Done useLayoutEffect to compute a targeted scroll that lands
  // the annotation card just above the InputBar (same intent as the Add Comment
  // landing). Cleared on consumption, on next arm, or on session change.
  const lastFocusedAnnotationMeasureRef = useRef<{ y: number; h: number } | null>(null);
  // Arm-time layoutH (pre-focus-mode-collapse). Approximates post-Done settled
  // lh. Persists past onEnd, consumed by the post-Done useLayoutEffect to
  // compute the target offset without reading the stale synchronous layoutHRef.
  const lastFocusedBaseLhRef = useRef<number>(0);
  // Final kb height captured at onStart (e.height is final, e.g. 335). Used
  // only as a gate (`> 0`) confirming onStart has fired before Path B starts
  // scrolling. Per-frame Path B uses live layoutHRef for the actual math.
  const finalKbHeightRef = useRef(0);
  // Sticky "Path B ever fired" flag. Set true on the first per-frame fire.
  // Corrective end-scroll uses this to decide whether to invoke the fallback
  // (revealSectionRef) when the worklet never scrolled (e.g. kb-already-up).
  const revealScrolledOnceRef = useRef(false);
  // Last per-frame Path B target. Used to suppress redundant retargets that
  // would otherwise cancel the in-flight animated scroll curve (animated:true
  // calls on iOS restart the curve on each invocation). Cleared on onEnd.
  const lastPathBTargetRef = useRef<number | null>(null);

  // UI-thread Path B pipeline. Reanimated drives the kb height per UI frame
  // via kbLiveSV (written from the useKeyboardHandler.onMove worklet below);
  // useAnimatedReaction recomputes the target and calls scrollTo (worklet) —
  // no runOnJS hops mid-animation, so the scroll tracks the kb in lockstep
  // instead of arriving as a post-kb-end batch.
  // (animatedScrollRef is declared earlier, near the top of the component,
  // so renderScrollComponent can capture it.)
  // kbLiveSV holds the POSITIVE per-frame kb height. We deliberately avoid
  // useReanimatedKeyboardAnimation's height SV here: on iOS, the lib updates
  // it ONLY at onKeyboardMoveStart (with the FINAL height) and onKeyboardMoveEnd
  // — not per-frame (see react-native-keyboard-controller/src/animated.tsx:
  // onKeyboardMove only updates Android). The instant jump-to-final at onStart
  // caused the reaction to fire scrollTo(target_for_full_kb) before kb visibly
  // rose; iOS clamped that to the current maxOffset, producing the visible
  // first-snap. Writing kbLiveSV from useKeyboardHandler.onMove (which DOES
  // fire per-frame on iOS) gives smooth tracking.
  const kbLiveSV = useSharedValue<number>(0);
  // Worklet snapshot of arm-time state. Populated by armPendingReveal once
  // the row measureLayout resolves; cleared on onEnd. While non-null, the
  // worklet owns Path B scrolling and the JS-side scrollRevealPerFrame
  // call is suppressed (gated on cachedRevealMeasureRef.current === null).
  const revealCacheSV = useSharedValue<{
    cy: number;
    ch: number;
    contentH: number;
    insetBottom: number;
    pillObstruction: number;
    armOffsetY: number;
  } | null>(null);
  const lastPathBTargetSV = useSharedValue<number>(-1);
  // Mirror of baselineLayoutHRef (max-tracker for layoutH growth post-arm).
  // Worklet reads this every frame to get the post-chrome pre-kb viewport.
  // Updated in onLayout; cleared in clearKeyboardBaseline.
  const baseLhSV = useSharedValue<number>(0);

  // Post-Done scroll. Fires from useKeyboardHandler.onEnd when e.height === 0
  // (kb fully hidden). At that point chrome regrow and content shrink (from
  // history load) have settled, so we can read live layoutH/contentH and
  // clamp target to maxOffset synchronously.
  //
  // Uses animated:false — animated:true scrollToOffset doesn't clamp DURING
  // animation on iOS UIScrollView. If target > eventual maxOffset, animation
  // overshoots then snaps back, producing the visible "extra scroll" bump.
  // animated:false applies clamp synchronously: no overshoot.
  //
  // The earlier-attempted onStart trigger fired too soon (before content
  // shrink), and animated:true could not predict the eventual maxOffset
  // — leading to the same overshoot pattern.
  const postDoneSettleScroll = useCallback(() => {
    const m = lastFocusedAnnotationMeasureRef.current;
    if (!m) return;
    lastFocusedAnnotationMeasureRef.current = null;
    lastFocusedBaseLhRef.current = 0;
    const lh = layoutHRef.current;
    const ch = latestContentHRef.current;
    if (lh <= 0 || ch <= 0) return;
    const maxOffset = Math.max(0, ch - lh);
    const POST_DONE_MARGIN = COMMENT_REVEAL_PILL_OBSTRUCTION;
    const cardBottom = m.y + m.h;
    const rawTarget = cardBottom - lh + POST_DONE_MARGIN;
    const target = Math.max(0, Math.min(rawTarget, maxOffset));
    const cur = offsetYRef.current;
    if (Math.abs(target - cur) < 5) return;
    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
      // eslint-disable-next-line no-console
      console.log(`[KB] postDoneSettle target=${Math.round(target)} cur=${Math.round(cur)} max=${Math.round(maxOffset)} cardBottom=${Math.round(cardBottom)} lh=${Math.round(lh)} ch=${Math.round(ch)}`);
    }
    listRef.current?.scrollToOffset({ offset: target, animated: false });
  }, []);

  // Fallback: if kb-hide onEnd never fires (kb already hidden when Done
  // tapped, etc.), still attempt the scroll on focus flip. No-op when
  // postDoneSettleScroll has already consumed the refs.
  const prevFocusActiveRef = useRef(annotationFocusActive);
  useLayoutEffect(() => {
    const wasActive = prevFocusActiveRef.current;
    prevFocusActiveRef.current = annotationFocusActive;
    if (annotationFocusActive || !wasActive) return;
    postDoneSettleScroll();
  }, [annotationFocusActive, postDoneSettleScroll]);

  const clearPendingReveal = useCallback(() => { pendingRevealRef.current = null; }, []);
  const clearComposerFocusFlag = useCallback(() => { composerFocusFlagRef.current = false; }, []);
  const clearKeyboardBaseline = useCallback(() => {
    baselineLayoutHRef.current = 0;
    armBaseLayoutHRef.current = 0;
    // Note: cachedRevealMeasureRef is cleared here; lastFocusedAnnotationMeasureRef
    // intentionally persists past onEnd so the post-Done useLayoutEffect can
    // compute a targeted scroll. It is cleared on consumption (in useLayoutEffect)
    // or on next arm / session change.
    cachedRevealMeasureRef.current = null;
    finalKbHeightRef.current = 0;
    revealScrolledOnceRef.current = false;
    lastPathBTargetRef.current = null;
    revealCacheSV.value = null;
    lastPathBTargetSV.value = -1;
    baseLhSV.value = 0;
    kbLiveSV.value = 0;
  }, [revealCacheSV, lastPathBTargetSV, baseLhSV, kbLiveSV]);

  // Effective viewport for Path A (tail-anchor). Uses min(baseLh - h, layoutH)
  // because Path A scrolls per-frame and must track progressive kb rise.
  const effectiveViewportH = (height: number): number => {
    const baseLh = baselineLayoutHRef.current;
    const liveLh = layoutHRef.current;
    if (baseLh <= 0) return Math.max(0, liveLh);
    if (liveLh <= 0) return Math.max(0, baseLh - height);
    return Math.max(0, Math.min(baseLh - height, liveLh));
  };

  // (Removed finalRestingViewportH — Path B now fires per-frame using the live
  // layoutHRef instead of the post-rise final viewport. See scrollRevealPerFrame.)

  // Path A: tail-anchor.
  const scrollTailFromBaseline = useCallback((height: number) => {
    const baseLh = baselineLayoutHRef.current;
    if (baseLh <= 0) {
      scrollToMessagesEnd(false);
      return;
    }
    const effLh = effectiveViewportH(height);
    const spacerH = spacerHeightRef.current;
    const contentH = latestContentHRef.current;
    if (contentH > 0 && effLh > 0) {
      const offset = Math.max(0, contentH - spacerH - effLh);
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
        // eslint-disable-next-line no-console
        console.log(`[KB] >>scroll PathA offset=${Math.round(offset)} effLh=${Math.round(effLh)} ts=${Date.now() % 100000}`);
      }
      listRef.current?.scrollToOffset({ offset, animated: false });
    } else {
      listRef.current?.scrollToEnd({ animated: false });
    }
  }, [scrollToMessagesEnd]);

  // Path B: per-frame reveal. Target computed from estimated post-kb viewport
  // (`baselineLh - height`) rather than live `layoutHRef`. baselineLh is the
  // pre-kb (post-chrome-collapse) layoutH; subtracting the current kb height
  // gives the effective visible-to-kb gap, which tracks the kb rise linearly
  // even when KAV's `layoutH` update lags 1-2 frames behind the kb height.
  // Without this, target was effectively constant until KAV caught up, then
  // jumped to final in one big snap — what the user saw as "scroll lands
  // after kb is already up". Now target moves frame-by-frame with the kb,
  // and per-frame animated:false snaps stitch into a motion that tracks
  // the rise. iOS clamp is enforced via maxOffset (live layoutH + inset).
  // Monotonic-down guard: never scroll UP (target < current offset). Early
  // frames have small target (kb barely up) and are skipped.
  const scrollRevealPerFrame = useCallback(
    (p: { annotationId: string; messageId: string }, height: number) => {
      const cached = cachedRevealMeasureRef.current;
      const baseLh = baselineLayoutHRef.current;
      if (!cached || baseLh <= 0) {
        if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
          // eslint-disable-next-line no-console
          console.log(`[KB] >>scroll PathB fallback (no cache or baseLh=0) ts=${Date.now() % 100000}`);
        }
        revealSectionRef.current(p.annotationId, p.messageId, false);
        revealScrolledOnceRef.current = true;
        return;
      }
      const effLh = Math.max(0, baseLh - height);
      const usableH = Math.max(0, effLh - COMMENT_REVEAL_PILL_OBSTRUCTION);
      const rawTarget = cached.y + cached.h - usableH;
      // Clamp to iOS-allowed max using LIVE layoutH + inset so we don't
      // over-scroll while KAV is still catching up to the kb height.
      const ch = latestContentHRef.current;
      const currentLh = layoutHRef.current;
      const maxOffset = Math.max(
        0,
        ch + FOCUS_MODE_CONTENT_INSET.bottom - Math.max(currentLh, 1),
      );
      const target = Math.max(0, Math.min(rawTarget, maxOffset));
      // Monotonic-down: skip frames where target lags the current offset.
      if (target <= offsetYRef.current) return;
      // Skip duplicate fires (target unchanged) — iOS no-op but avoids log noise.
      const lastTarget = lastPathBTargetRef.current;
      if (lastTarget !== null && target === lastTarget) return;
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
        // eslint-disable-next-line no-console
        console.log(`[KB] >>scroll PathB offset=${Math.round(target)} effLh=${Math.round(effLh)} kbH=${Math.round(height)} currentLh=${Math.round(currentLh)} baseLh=${Math.round(baseLh)} ts=${Date.now() % 100000}`);
      }
      listRef.current?.scrollToOffset({ offset: target, animated: false });
      lastPathBTargetRef.current = target;
      revealScrolledOnceRef.current = true;
    },
    [],
  );

  const onKeyboardFrame = useCallback((height: number) => {
    // Track baseLh upward as layoutH grows. Chrome-collapse expands FlashList's
    // measured height past the arm-time value; we want the POST-collapse peak
    // so Path B's target reflects the final resting viewport.
    if (layoutHRef.current > baselineLayoutHRef.current) {
      baselineLayoutHRef.current = layoutHRef.current;
    }

    if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
      // eslint-disable-next-line no-console
      console.log(
        `[KB] h=${Math.round(height)} layoutH=${Math.round(layoutHRef.current)} ` +
        `baseLh=${Math.round(baselineLayoutHRef.current)} finalH=${Math.round(finalKbHeightRef.current)} ` +
        `contentH=${Math.round(latestContentHRef.current)} spacer=${Math.round(spacerHeightRef.current)} ` +
        `composerFlag=${composerFocusFlagRef.current} pendingReveal=${pendingRevealRef.current ? 'y' : 'n'} ` +
        `ts=${Date.now() % 100000}`,
      );
    }
    keyboardHRef.current = height;

    if (
      isResettingRef.current ||
      pinToBottomRef.current !== null ||
      Date.now() < pinUntilTsRef.current ||
      needsAnchorSpaceRef.current
    ) return;

    const p = pendingRevealRef.current;

    // Path A: tail anchor. Suppressed when Path B reveal pending — Add Comment
    // intent dominates, and both firing causes a lurch (frame 1 vs frame 2
    // targets differ by ~300px due to layoutH discontinuity from chrome growth).
    if (composerFocusFlagRef.current && isNearBottomRef.current && !p) {
      scrollTailFromBaseline(height);
    }

    // Path B (JS fallback): per-frame reveal. Fires every kb-rise frame once
    // baseLh peaked past arm-time (chrome collapsed) AND finalKbHeight known.
    // Suppressed when revealCacheSV is populated — in that case the UI-thread
    // useAnimatedReaction below owns scrolling (no runOnJS hops, lockstep
    // with kb animation). This branch handles the case where measureLayout
    // failed (cache never populated) so we still get a per-frame attempt.
    if (
      p &&
      baselineLayoutHRef.current > armBaseLayoutHRef.current &&
      finalKbHeightRef.current > 0 &&
      cachedRevealMeasureRef.current === null
    ) {
      scrollRevealPerFrame(p, height);
    }
  }, [scrollTailFromBaseline, scrollRevealPerFrame]);

  // UI-thread Path B reaction. Runs every UI frame while kb is rising/falling
  // (driven by useReanimatedKeyboardAnimation's height SharedValue). Computes
  // target from arm-time cache + live kb height, scrolls via worklet scrollTo.
  // Owned-by-worklet whenever revealCacheSV is non-null; JS scrollRevealPerFrame
  // is gated off in that case to avoid double-scrolling.
  // Monotonic-down + duplicate-target guards mirror scrollRevealPerFrame.
  useAnimatedReaction(
    () => ({
      kb: kbLiveSV.value,
      cache: revealCacheSV.value,
      baseLh: baseLhSV.value,
    }),
    ({ kb, cache, baseLh }) => {
      'worklet';
      if (!cache || kb <= 0 || baseLh <= 0) return;
      const effLh = Math.max(0, baseLh - kb);
      const usableH = Math.max(0, effLh - cache.pillObstruction);
      const rawTarget = cache.cy + cache.ch - usableH;
      const maxOffset = Math.max(
        0,
        cache.contentH + cache.insetBottom - Math.max(effLh, 1),
      );
      const target = Math.max(0, Math.min(rawTarget, maxOffset));
      if (target <= cache.armOffsetY) return;
      if (target === lastPathBTargetSV.value) return;
      lastPathBTargetSV.value = target;
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
        // console.log is allowed in worklets in Reanimated
        // eslint-disable-next-line no-console
        console.log(`[KB] >>worklet PathB target=${Math.round(target)} kb=${Math.round(kb)} effLh=${Math.round(effLh)}`);
      }
      scrollTo(animatedScrollRef, 0, target, false);
    },
    [],
  );

  // Corrective end-scroll.
  // - If reveal was pending (Path B owned the rise): only fire fallback if
  //   worklet never scrolled. NEVER fire Path A tail-anchor here — it would
  //   snap to a different offset (chat tail vs annotation-row target) after
  //   Path B already landed, producing the "delayed snap" jank.
  // - Else (pure composer focus, no reveal): re-anchor tail with settled
  //   layoutHRef.
  const correctiveEndScroll = useCallback(() => {
    const p = pendingRevealRef.current;
    if (p) {
      // Worklet-driven path also counts as "scrolled": lastPathBTargetSV gets
      // a positive target when the reaction fires scrollTo. Without this check,
      // the worklet would do the right scroll and then this fallback would fire
      // revealSectionRef on top of it (the original "delayed snap" symptom).
      const workletScrolled = lastPathBTargetSV.value > 0;
      if (!revealScrolledOnceRef.current && !workletScrolled) {
        if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
          // eslint-disable-next-line no-console
          console.log(`[KB] corrective Path B fallback ts=${Date.now() % 100000}`);
        }
        revealSectionRef.current(p.annotationId, p.messageId, false);
      } else if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
        // eslint-disable-next-line no-console
        console.log(`[KB] corrective skipped (Path B already scrolled) ts=${Date.now() % 100000}`);
      }
      return;
    }
    if (composerFocusFlagRef.current && isNearBottomRef.current) {
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
        // eslint-disable-next-line no-console
        console.log(`[KB] corrective Path A scrollToMessagesEnd ts=${Date.now() % 100000}`);
      }
      scrollToMessagesEnd(false);
    }
  }, [scrollToMessagesEnd]);

  // onStart fires once with e.height = FINAL kb height (iOS sends destination
  // height immediately). Cache it so Path B can target the final viewport
  // without waiting for kb to fully rise.
  const captureFinalKbHeight = useCallback((height: number) => {
    if (height > 0) finalKbHeightRef.current = height;
  }, []);

  useKeyboardHandler({
    onStart: (e) => {
      'worklet';
      // CRITICAL: do NOT jump kbLiveSV to e.height here. iOS sends the FINAL
      // height in onStart. If the reaction sees that immediately, it fires
      // scrollTo(target_for_full_kb) before the kb has visibly risen, iOS
      // clamps that to current maxOffset, and the user sees a first snap.
      // Hold at 0 (or whatever onMove will start at) so the reaction stays
      // gated until onMove begins delivering per-frame interpolated heights.
      kbLiveSV.value = 0;
      runOnJS(captureFinalKbHeight)(e.height);
      runOnJS(onKeyboardFrame)(e.height);
    },
    onMove:  (e) => {
      'worklet';
      kbLiveSV.value = e.height;
      runOnJS(onKeyboardFrame)(e.height);
    },
    onEnd:   (e) => {
      'worklet';
      kbLiveSV.value = e.height;
      runOnJS(onKeyboardFrame)(e.height);
      runOnJS(correctiveEndScroll)();
      runOnJS(clearPendingReveal)();
      runOnJS(clearComposerFocusFlag)();
      runOnJS(clearKeyboardBaseline)();
      // kb fully hidden: chrome regrow + content shrink (history load) have
      // settled by this point. Fire animated:false snap using live state so
      // target is clamped to maxOffset synchronously — no overshoot.
      if (e.height === 0) {
        runOnJS(postDoneSettleScroll)();
      }
    },
  }, [onKeyboardFrame, captureFinalKbHeight, correctiveEndScroll, clearPendingReveal, clearComposerFocusFlag, clearKeyboardBaseline, postDoneSettleScroll]);

  useEffect(() => {
    pendingRevealRef.current = null;
    lastFocusedAnnotationMeasureRef.current = null;
    lastFocusedBaseLhRef.current = 0;
  }, [sessionKey]);

  // Expose scroll-to-message / scroll-to-annotation for external callers.
  useImperativeHandle(messageListRef, () => ({
    scrollToMessageId(id: string): void {
      const idx = orderedRef.current.findIndex((m) => m.id === id);
      if (idx === -1) return;
      pinUntilTsRef.current = 0;
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 32 });
    },
    scrollToAnnotationId(annotationId: string, messageId: string): void {
      pinUntilTsRef.current = 0;
      const rowView = annotationRegistry.getRef(annotationId);
      if (rowView) {
        const scrollNode = listRef.current?.getNativeScrollRef?.();
        if (scrollNode) {
          rowView.measureLayout(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scrollNode as any,
            (_x: number, y: number) => {
              listRef.current?.scrollToOffset({ offset: Math.max(0, y - 24), animated: true });
            },
            () => {
              const idx = orderedRef.current.findIndex((m) => m.id === messageId);
              if (idx !== -1) {
                listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 32 });
              }
            },
          );
          return;
        }
      }
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
    revealMessageBottom(messageId: string, opts?: { force?: boolean }): void {
      if (!opts?.force && !isNearBottomRef.current) return;
      pinUntilTsRef.current = 0;

      const fallback = (): void => {
        const idx = orderedRef.current.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          listRef.current?.scrollToIndex({
            index: idx,
            animated: true,
            viewPosition: 1,
            viewOffset: ANNOTATION_REVEAL_OFFSET,
          });
        }
      };

      const scrollNode = listRef.current?.getNativeScrollRef?.();
      if (!scrollNode) { fallback(); return; }

      // Find the last registered section for this message (highest section index).
      const sectionKeys = sectionRegistry.getSectionKeysForMessage(messageId);
      if (sectionKeys.length === 0) { fallback(); return; }
      sectionKeys.sort();
      const lastKey = sectionKeys[sectionKeys.length - 1];
      if (!lastKey) { fallback(); return; }
      const lastView = sectionRegistry.getRef(lastKey);
      if (!lastView) { fallback(); return; }

      lastView.measureLayout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scrollNode as any,
        (_x: number, y: number, _w: number, h: number) => {
          const sectionBottom = y + h;
          const usableH = layoutHRef.current - ANNOTATION_REVEAL_OFFSET;
          // Already visible above the fold — no scroll needed. Skipped when
          // forced: callers that explicitly target this message want the
          // section bottom anchored to the InputBar edge, even if that means
          // scrolling backward to bring it down from a higher position.
          if (!opts?.force && sectionBottom - offsetYRef.current <= usableH) return;
          const targetOffset = Math.max(0, sectionBottom - usableH);
          const maxOffset = Math.max(0, latestContentHRef.current - layoutHRef.current);
          listRef.current?.scrollToOffset({
            offset: Math.min(targetOffset, maxOffset),
            animated: true,
          });
        },
        fallback,
      );
    },
    notifyComposerFocus(): void {
      // Seed baseLh only if unset — worklet tracks max(layoutH) per frame, so
      // overwriting here with a mid-collapse value would regress the peak.
      if (baselineLayoutHRef.current === 0) {
        baselineLayoutHRef.current = layoutHRef.current;
        armBaseLayoutHRef.current = layoutHRef.current;
      }
      composerFocusFlagRef.current = true;
    },
    armPendingReveal(annotationId: string, messageId: string): void {
      // Seed baseLh only if unset — worklet tracks max(layoutH) post-arm and
      // captures the true post-chrome-collapse peak.
      if (baselineLayoutHRef.current === 0) {
        baselineLayoutHRef.current = layoutHRef.current;
        armBaseLayoutHRef.current = layoutHRef.current;
      }
      pendingRevealRef.current = { annotationId, messageId };
      cachedRevealMeasureRef.current = null;
      lastFocusedAnnotationMeasureRef.current = null;
      // Snapshot current layoutH at arm — this is the pre-focus-mode-collapse
      // value (composer not yet focused). Used by post-Done useLayoutEffect.
      lastFocusedBaseLhRef.current = layoutHRef.current;
      revealCacheSV.value = null;
      lastPathBTargetSV.value = -1;
      revealScrolledOnceRef.current = false;
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
        // eslint-disable-next-line no-console
        console.log(`[KB] armPendingReveal id=${annotationId.slice(0,6)} baseLh=${Math.round(layoutHRef.current)} kbUp=${keyboardHRef.current > 0} ts=${Date.now() % 100000}`);
      }
      // Pre-measure annotation row once so the worklet doesn't pay async
      // measureLayout cost per frame (iOS queues those during kb animation).
      // The reaction-driven UI-thread Path B reads from revealCacheSV which
      // is populated here once measure resolves. JS-side scrollRevealPerFrame
      // fallback fires only when cachedRevealMeasureRef stays null.
      const scrollNode = listRef.current?.getNativeScrollRef?.();
      const rowView = annotationRegistry.getRef(annotationId);
      if (rowView && scrollNode) {
        rowView.measureLayout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scrollNode as any,
          (_x: number, y: number, _w: number, h: number) => {
            cachedRevealMeasureRef.current = { y, h };
            // Mirror into the persistent ref so the post-Done useLayoutEffect
            // can target this card after onEnd clears the worklet cache.
            lastFocusedAnnotationMeasureRef.current = { y, h };
            // Seed baseLhSV from current layoutH so the reaction has a value
            // immediately (onLayout may not fire again before kb starts).
            // onLayout's max-tracker bumps it further if chrome grows.
            if (layoutHRef.current > baseLhSV.value) {
              baseLhSV.value = layoutHRef.current;
            }
            revealCacheSV.value = {
              cy: y,
              ch: h,
              contentH: latestContentHRef.current,
              insetBottom: FOCUS_MODE_CONTENT_INSET.bottom,
              pillObstruction: COMMENT_REVEAL_PILL_OBSTRUCTION,
              armOffsetY: offsetYRef.current,
            };
            if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
              // eslint-disable-next-line no-console
              console.log(`[KB] cached measure y=${Math.round(y)} h=${Math.round(h)} ts=${Date.now() % 100000}`);
            }
          },
          () => { /* keep null → JS scrollRevealPerFrame fallback fires */ },
        );
      }
      if (keyboardHRef.current > 0) {
        if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_KEYBOARD === '1') {
          // eslint-disable-next-line no-console
          console.log(`[KB] armPendingReveal RAF (kb already up) ts=${Date.now() % 100000}`);
        }
        requestAnimationFrame(() => {
          revealSectionRef.current(annotationId, messageId);
        });
      }
    },
    scrollToBottomIfNearBottom(animated: boolean): void {
      if (!isNearBottomRef.current) return;
      scrollToBottom(animated);
    },
  // annotationRegistry and sectionRegistry callbacks are stable (created with useCallback/useRef)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [annotationRegistry, sectionRegistry, scrollToBottom]);

  // Stable ref so renderItem can call revealSectionForAnnotation without
  // needing it in the dep array (which would recreate the closure on every
  // keyboard event).
  const revealSectionRef = useRef<(annotationId: string, messageId: string, animated?: boolean) => void>(
    () => { /* noop until imperative handle is wired */ },
  );
  useEffect(() => {
    revealSectionRef.current = (annotationId: string, messageId: string, animated = true) => {
      pinUntilTsRef.current = 0;
      pendingRevealRef.current = { annotationId, messageId };
      const scrollNode = listRef.current?.getNativeScrollRef?.();
      const rowView = annotationRegistry.getRef(annotationId);

      const doMeasure = (view: ReturnType<typeof annotationRegistry.getRef>): void => {
        if (!view || !scrollNode) return;
        view.measureLayout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scrollNode as any,
          (_x: number, y: number, _w: number, h: number) => {
            const visibleH = layoutHRef.current;
            const kb = keyboardHRef.current;
            let usableH = visibleH - COMMENT_REVEAL_PILL_OBSTRUCTION;
            if (kb > 0) {
              usableH -= kb;
            }
            const rawTarget = y + h - usableH;
            const ch = latestContentHRef.current;
            const maxOffset = Math.max(0, ch - visibleH);
            const target = Math.max(0, Math.min(rawTarget, maxOffset));
            listRef.current?.scrollToOffset({ offset: target, animated });
          },
          () => {
            const idx = orderedRef.current.findIndex((m) => m.id === messageId);
            if (idx !== -1) {
              listRef.current?.scrollToIndex({ index: idx, animated, viewOffset: 32 });
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
        listRef.current?.scrollToIndex({ index: idx, animated, viewOffset: 32 });
        requestAnimationFrame(() => {
          doMeasure(annotationRegistry.getRef(annotationId));
        });
      }
    };
  // annotationRegistry is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationRegistry]);

  const renderMessageCell = useCallback(
    (item: ChatUiMessage): React.ReactElement | null => {
      let inner: React.ReactElement | null;
      if (item.kind === 'info') {
        if (isResettingRef.current && item.id.startsWith('reset-')) {
          inner = <View style={{ height: 0 }} />;
        } else {
          inner = <InfoMarker text={item.content} />;
        }
      } else if (item.kind === 'approvalGroup' && item.approvals?.length) {
        inner = (
          <ApprovalCard
            approvals={item.approvals}
            onDecide={(id, d) => onApprovalDecideRef.current?.(id, d)}
            isConnected={isConnectedRef.current}
          />
        );
      } else if (item.kind === 'internalEvent' && item.internalEvent) {
        const hasMedia = (item.images && item.images.length > 0) || item.audioUrl || item.videoUrl;
        const hasFiles = item.files && item.files.length > 0;
        if (!hasMedia && !hasFiles) {
          inner = <InternalEventCard event={item.internalEvent} timestamp={item.timestamp} />;
        } else {
          inner = (
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
      } else {
        inner = (
          <MessageBubble
            message={item}
            showThinking={showThinkingRef.current}
            showToolCalls={showToolCallsRef.current}
            onRetry={onRetryRef.current}
            onSpeak={onSpeakRef.current}
            onReplyToPrompt={onReplyToPromptRef.current}
            onAnnotate={onAnnotateRef.current}
            annotateMode={annotateMessageId === item.id}
            hasSavedAnnotations={(annotationCountByMessage?.get(item.id) ?? 0) > 0}
            annotationCount={annotationCountByMessage?.get(item.id) ?? 0}
            highlightedAnnotationId={highlightedAnnotationId}
            animateOnMount={!suppressEnteringRef.current}
            files={filesRef.current}
            onOpenFile={openFileRef.current}
            colors={colorsRef.current}
            markdownStyles={markdownStylesRef.current}
            onCommentFocus={(annotationId, messageId) => {
              revealSectionRef.current(annotationId, messageId);
            }}
            onCommentBlur={() => {
              pendingRevealRef.current = null;
            }}
            onLayout={
              item.role === 'user'
                ? (e) => handleUserMsgLayoutRef.current(item.id, e.nativeEvent.layout.height)
                : undefined
            }
          />
        );
      }

      // Per-item height tracing. Enable with:
      //   EXPO_PUBLIC_DEBUG_ITEM_HEIGHTS=1 npx expo start
      // Each onLayout logs height + the field shape that drives conditional
      // rendering in MessageBubble. Diff between emissions of the same id to
      // find which field flipped between renders (tool calls collapsing,
      // thinking block toggling, interactive card resolving, etc.).
      if (__DEV__ && process.env.EXPO_PUBLIC_DEBUG_ITEM_HEIGHTS === '1') {
        const msg = item as ChatUiMessage & {
          parts?: unknown[];
          toolCalls?: unknown[];
          thinkingBlocks?: unknown[];
          interactive?: unknown;
          images?: unknown[];
          files?: unknown[];
          audioUrl?: string;
          videoUrl?: string;
          isStreaming?: boolean;
          interrupted?: boolean;
          content?: string;
        };
        const shape = [
          `parts=${msg.parts?.length ?? 0}`,
          `tc=${msg.toolCalls?.length ?? 0}`,
          `th=${msg.thinkingBlocks?.length ?? 0}`,
          `int=${msg.interactive ? 1 : 0}`,
          `img=${msg.images?.length ?? 0}`,
          `fil=${msg.files?.length ?? 0}`,
          `aud=${msg.audioUrl ? 1 : 0}`,
          `vid=${msg.videoUrl ? 1 : 0}`,
          `stream=${msg.isStreaming ? 1 : 0}`,
          `intr=${msg.interrupted ? 1 : 0}`,
          `clen=${(msg.content ?? '').length}`,
        ].join(' ');
        return (
          <View
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              // eslint-disable-next-line no-console
              console.log(
                `[ItemHeight] id=${item.id} kind=${item.kind ?? 'msg'} role=${item.role ?? '-'} h=${h} ${shape}`,
              );
            }}
          >
            {inner}
          </View>
        );
      }
      return inner;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [annotateMessageId, highlightedAnnotationId, annotationCountByMessage],
  );

  const renderFlashItem: FlashListRenderItem<ChatUiMessage> = useCallback(
    ({ item }) => renderMessageCell(item),
    [renderMessageCell],
  );

  const renderFlatItem: RNListRenderItem<ChatUiMessage> = useCallback(
    (info) => renderMessageCell(info.item),
    [renderMessageCell],
  );

  const keyExtractor = useCallback((item: ChatUiMessage) => item.id, []);

  // FlashList recycle pool selector — keeps separate pools for info markers,
  // internalEvent cards, the synthetic spacer, and user/assistant bubbles so
  // cells only recycle within visually compatible types.
  const getItemType = useCallback((item: ChatUiMessage): string => {
    if (item.kind === 'info') return 'info';
    if (item.kind === 'internalEvent') return 'internalEvent';
    if (item.kind === 'approvalGroup') return 'approvalGroup';
    return item.role === 'user' ? 'bubble:user' : 'bubble:assistant';
  }, []);

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (hasNewMessagesState) {
      pulse.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 500 }), withTiming(1, { duration: 500 })),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [hasNewMessagesState, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const isAnnotationDraftActive = useIsAnnotationDraftActive();
  const showPill = showPillState && !isAnnotationDraftActive;
  const hasNewMessages = hasNewMessagesState;

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
          colors={[hexToRgba(colors.primary, 0), hexToRgba(colors.primary, 0.26), hexToRgba(colors.primary, 0)]}
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
          <SectionLayoutProvider value={sectionRegistry}>
          <Animated.View style={[styles.flex, listAnimatedStyle]}>
            {USE_FLASH_LIST ? (
              <FlashList
                ref={listRef as React.RefObject<FlashListRef<ChatUiMessage>>}
                renderScrollComponent={renderScrollComponent}
                data={ordered}
                keyExtractor={keyExtractor}
                renderItem={renderFlashItem}
                getItemType={getItemType}
                extraData={[annotateMessageId, highlightedAnnotationId, annotationCountByMessage]}
                onScroll={onScroll}
                scrollEventThrottle={16}
                onScrollBeginDrag={onScrollBeginDrag}
                onScrollEndDrag={onScrollEndDrag}
                onContentSizeChange={onContentSizeChange}
                onLayout={onLayout}
                ItemSeparatorComponent={ItemSep}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={suppressKeyboardDismissOnScroll ? 'none' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={listContentStyle}
                // MVCP config (see flashListMvcp memo):
                //  - historyLoading: autoscrollToTopThreshold: 0 keeps prepended
                //    older messages from shifting the viewport.
                //  - otherwise: autoscrollToBottomThreshold: 1 lets FlashList pin
                //    the tail natively during measurement settle (markdown reflow,
                //    code highlight, image load) without a JS round trip —
                //    eliminates the per-event flicker we used to get from running
                //    scrollToEnd JS-side on every onContentSizeChange. The JS-side
                //    pinUntilTsRef window stays armed as a backstop; it becomes a
                //    no-op once MVCP has already pinned (scrollToEnd on an
                //    already-at-end list) and is the only mechanism that runs on
                //    the FlatList fallback path.
                maintainVisibleContentPosition={flashListMvcp}
                // Annotation focus enter: chrome collapse grows FlashList's
                // viewport (~84px) BEFORE the kb rises. If user was near
                // bottom, post-collapse `offset + viewport` exceeds contentH,
                // and iOS UIScrollView native-clamps contentOffset down.
                // contentInset.bottom extends the legal scroll range — lets
                // contentOffset stay where it was during the brief
                // grew-too-big window. Path B worklet then progressively
                // scrolls user to the annotation target. Done-flow clamp is
                // handled separately by the post-exit animated scroll above.
                contentInset={annotationFocusActive ? FOCUS_MODE_CONTENT_INSET : undefined}
                ListHeaderComponent={null}
                ListFooterComponent={spacerHeight > 0 ? <View style={{ height: spacerHeight }} /> : null}
              />
            ) : (
              <FlatList
                ref={listRef as React.RefObject<FlatList<ChatUiMessage>>}
                data={ordered}
                keyExtractor={keyExtractor}
                renderItem={renderFlatItem}
                extraData={[annotateMessageId, highlightedAnnotationId, annotationCountByMessage]}
                onScroll={onScroll}
                scrollEventThrottle={16}
                onScrollBeginDrag={onScrollBeginDrag}
                onScrollEndDrag={onScrollEndDrag}
                onContentSizeChange={onContentSizeChange}
                onLayout={onLayout}
                onScrollToIndexFailed={onScrollToIndexFailed}
                contentContainerStyle={listContentStyle}
                ItemSeparatorComponent={ItemSep}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={suppressKeyboardDismissOnScroll ? 'none' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                initialNumToRender={8}
                maxToRenderPerBatch={5}
                updateCellsBatchingPeriod={50}
                windowSize={11}
                removeClippedSubviews
                // Only enable MVCP while a history RPC is in-flight. Prevents
                // prepended older messages from shifting the viewport.
                maintainVisibleContentPosition={
                  historyLoading ? { minIndexForVisible: 0 } : undefined
                }
                ListHeaderComponent={null}
                ListFooterComponent={spacerHeight > 0 ? <View style={{ height: spacerHeight }} /> : null}
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
          </SectionLayoutProvider>
          </AnnotationLayoutProvider>
        </View>
      )}

      {showActivityRow && (
        <View
          style={[
            styles.activityOverlay,
            { backgroundColor: colors.background },
          ]}
          pointerEvents="none"
          onLayout={(e) => setActivityOverlayH(e.nativeEvent.layout.height)}
        >
          <BrandLoader variant="mini" />
          <StreamingText label={activityLabel} />
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
    height: TOP_FADE_HEIGHT,
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
  activityOverlay: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    zIndex: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
});
