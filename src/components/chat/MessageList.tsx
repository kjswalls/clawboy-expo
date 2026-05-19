import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
import { KeyboardEvents } from 'react-native-keyboard-controller';

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
  /** Called once per user-initiated drag — used to dismiss annotation focus mode on scroll. */
  onScrollUserDismiss?: () => void;
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
  onScrollUserDismiss,
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
  const isUserDraggingRef = useRef(false);
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

  const [layoutH, setLayoutH] = useState(0);
  const [activityOverlayH, setActivityOverlayH] = useState(0);
  const spacerHeight = useMemo(
    () => computeBottomSpacer({ needsAnchorSpace, layoutH }),
    [needsAnchorSpace, layoutH],
  );
  const spacerHeightRef = useRef(spacerHeight);
  const topSpacerHeightRef = useRef(0);
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

  const hasMessageContent = useMemo(
    () => ordered.some((m) => m.role === 'user' || m.role === 'assistant'),
    [ordered],
  );
  const topSpacerHeight = useMemo(
    () => (hasMessageContent ? 0 : layoutH),
    [hasMessageContent, layoutH],
  );
  topSpacerHeightRef.current = topSpacerHeight;

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
    if (topSpacerHeight > 0) return;

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
        sendAnchorRafRef.current = requestAnimationFrame(() => {
          sendAnchorRafRef.current = null;
          const contentH = latestContentHRef.current;
          const spacerH = spacerHeightRef.current;
          const activityPad = activityPadExtraRef.current;
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
          // Subtracting spacerH gives actual message content height; topSpacer
          // is always 0 here (hasMessageContent is true by this point).
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

          if (contentH > 0 && spacerH > 0) {
            // For scrolled-up sends the new msg is off-screen → FlashList skips
            // onLayout → msgH = 0. Estimate a typical single-line user-bubble
            // height so the formula places msg TOP (not msg END) near viewOffset.
            // After scroll lands, real measurement is captured for next send.
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
  }, [lastId, markdownStyles, topSpacerHeight]);

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
    isNearBottomRef.current = true;
    unseenContentRef.current = false;
    setShowPillState(false);
    setHasNewMessagesState(false);
    armPinToBottom(true);
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
          scrollToMessagesEnd(false);
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

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const ch = e.nativeEvent.contentSize.height;
      const lh = e.nativeEvent.layoutMeasurement.height;
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

  const flashListMvcp = useMemo(() => (
    historyLoading ? { autoscrollToTopThreshold: 0 } : undefined
  ), [historyLoading]);

  const onScrollBeginDrag = useCallback(() => {
    isUserDraggingRef.current = true;
    onScrollUserDismiss?.();
  }, [onScrollUserDismiss]);
  const onScrollEndDrag = useCallback(() => { isUserDraggingRef.current = false; }, []);

  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      latestContentHRef.current = h;

      const realH = h - spacerHeightRef.current;
      const newDistFromEnd = realH - layoutHRef.current - offsetYRef.current;
      const newNearBottom = newDistFromEnd < layoutHRef.current * NEAR_BOTTOM_FRACTION;
      if (newNearBottom !== isNearBottomRef.current) {
        isNearBottomRef.current = newNearBottom;
        if (newNearBottom) unseenContentRef.current = false;
        updatePillState();
      }

      // Don't scroll while the user has a finger down — fighting an active drag
      // causes jank. Leave pinToBottomRef set so the next onContentSizeChange
      // (after finger lift) can still fire.
      if (!isUserDraggingRef.current && shouldFirePinLatch(pinToBottomRef.current, isNearBottomRef.current)) {
        pinToBottomRef.current = null;
        if (pinToBottomTimerRef.current !== null) {
          clearTimeout(pinToBottomTimerRef.current);
          pinToBottomTimerRef.current = null;
        }
        scrollToMessagesEnd(false);
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
      layoutHRef.current = h;
      setLayoutH(h);
    },
    [],
  );

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
  useEffect(() => {
    const runPendingReveal = (): void => {
      const p = pendingRevealRef.current;
      if (!p) return;
      revealSectionRef.current(p.annotationId, p.messageId);
    };

    const didShow = KeyboardEvents.addListener('keyboardDidShow', (e) => {
      keyboardHRef.current = e.height;
      requestAnimationFrame(() => {
        requestAnimationFrame(runPendingReveal);
      });
    });

    const willShow =
      Platform.OS === 'ios'
        ? KeyboardEvents.addListener('keyboardWillShow', (e) => {
            keyboardHRef.current = e.height;
          })
        : null;

    const hide = KeyboardEvents.addListener('keyboardDidHide', () => {
      keyboardHRef.current = 0;
    });

    return () => {
      didShow.remove();
      willShow?.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    pendingRevealRef.current = null;
  }, [sessionKey]);

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
  const revealSectionRef = useRef<(annotationId: string, messageId: string) => void>(
    () => { /* noop until imperative handle is wired */ },
  );
  useEffect(() => {
    revealSectionRef.current = (annotationId: string, messageId: string) => {
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
            if (Platform.OS !== 'ios' && kb > 0) {
              usableH -= kb;
            }
            const rawTarget = y + h - usableH;
            const ch = latestContentHRef.current;
            const maxOffset = Math.max(0, ch - visibleH);
            const target = Math.max(0, Math.min(rawTarget, maxOffset));
            listRef.current?.scrollToOffset({ offset: target, animated: true });
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

  const renderMessageCell = useCallback(
    (item: ChatUiMessage): React.ReactElement | null => {
      if (item.kind === 'info') {
        if (isResettingRef.current && item.id.startsWith('reset-')) {
          return <View style={{ height: 0 }} />;
        }
        return <InfoMarker text={item.content} />;
      }
      if (item.kind === 'approvalGroup' && item.approvals?.length) {
        return (
          <ApprovalCard
            approvals={item.approvals}
            onDecide={(id, d) => onApprovalDecideRef.current?.(id, d)}
            isConnected={isConnectedRef.current}
          />
        );
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
          colors={['transparent', hexToRgba(colors.primary, 0.26), 'transparent']}
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
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={listContentStyle}
                // autoscrollToBottomThreshold omitted (default -1) — disables FlashList's
                // auto-scroll so it can't race the send-anchor effect. history-load case:
                // MVCP enabled so prepended older messages don't shift the viewport.
                maintainVisibleContentPosition={flashListMvcp}
                ListHeaderComponent={topSpacerHeight > 0 ? <View style={{ height: topSpacerHeight }} /> : null}
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
                keyboardDismissMode="on-drag"
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
                ListHeaderComponent={topSpacerHeight > 0 ? <View style={{ height: topSpacerHeight }} /> : null}
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
