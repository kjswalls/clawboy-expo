import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import Markdown from '@ronradtke/react-native-markdown-display';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AlertTriangle, Check, Copy, MessageSquarePlus, RotateCcw, Volume2, VolumeX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

import { BorderRadius, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { useStreamReveal } from '@/hooks/useStreamReveal';
import type { AgentFile } from '@/lib/openclaw/types';
import type { ThemeColors } from '@/types';
import type { ChatUiMessage, ChatUiMessagePart, ChatUiThinkingBlock, ChatUiToolCall } from '@/types/chat-ui';
import { formatMessageTime } from '@/utils/formatting';
import { type MarkdownStyles, chatMarkdownIt } from '@/utils/markdownTheme';
import { extractBareHref, findAgentFileMatch, isInternalLink } from '@/utils/links';
import { getCachedMarkdownAst } from '@/utils/markdownCache';
import { stripClawboyOptionsForRender } from '@/lib/openclaw/interactive';

import { markdownFenceRule } from './CodeBlock';
import { FileAttachmentCard } from './FileAttachmentCard';
import { InteractiveOptionsCard } from './InteractiveOptionsCard';
import { MediaEmbed } from './MediaEmbed';
import { StreamingCursor } from './StreamingCursor';
import { StreamingText } from './StreamingText';
import { ThinkingNode } from './ThinkingNode';
import { ToolCallCard } from './ToolCallCard';
import { AnnotatedMessageBody } from './AnnotatedMessageBody';

// Private-use sentinel appended to revealed text so the markdown `text` rule
// can inject the blinking cursor inline at the exact end of the last text node.
const CURSOR_SENTINEL = '\uE001';

// Returns true when the revealed text has an unclosed code fence (odd count of
// ``` delimiters), meaning the sentinel would land inside a code block.
// In that case we skip the inline sentinel and let the fallback cursor render.
function hasUnclosedFence(text: string): boolean {
  return ((text.match(/```/g)?.length) ?? 0) % 2 === 1;
}

// ---------------------------------------------------------------------------
// Link rule
//
// Builds a custom `link` rule for @ronradtke/react-native-markdown-display.
// Uses <Text onPress> (not <Pressable>) so inline links share the paragraph
// baseline and the underline sits below the glyphs.
// - External URLs (http/https/mailto/tel…) → Text opening via Linking.
// - Internal file paths → Text opening the in-app file viewer.
// - Internal file paths with no match → plain Text (link stripped).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Paragraph rule
//
// Overrides the default library paragraph rule, which renders as a `<View>`
// with `flexDirection:'row'` + `flexWrap:'wrap'`. That path requires Yoga to
// measure every inline child as a flex item and is prone to mis-measuring the
// last line's height, causing text clip (agent bubbles) and overflow into
// adjacent rows (user bubbles) when the bubble width is set via `maxWidth`
// rather than an explicit `width`.
//
// Rendering as `<Text>` delegates wrapping to the native text engine
// (CoreText / Android TextLayout), which always self-measures correctly and
// is faster on long paragraphs — a net win during streaming tail re-renders.
// All inline descendants (text, strong, em, code_inline, link, StreamingCursor)
// are already Text-compatible, so nesting is safe.
// ---------------------------------------------------------------------------

function makeParagraphRule(paragraphStyle: object) {
  return function ParagraphRule(
    node: { key?: string },
    children: React.ReactNode,
  ): React.JSX.Element {
    return (
      <Text key={node.key} style={paragraphStyle}>
        {children}
      </Text>
    );
  };
}

function makeLinkRule(
  files: AgentFile[],
  onOpenFile: (name: string) => void,
  linkStyle: object,
  textStyle: object,
) {
  return function LinkRule(
    node: { key?: string; attributes?: { href?: string } },
    children: React.ReactNode,
  ): React.JSX.Element {
    const href = String(node.attributes?.href ?? '');
    if (!isInternalLink(href)) {
      return (
        <Text
          key={node.key}
          style={linkStyle}
          accessibilityRole="link"
          onPress={() => { void Linking.openURL(href); }}
        >
          {children}
        </Text>
      );
    }
    // Internal link — always tappable. Try the cached file list first for an
    // exact match; fall back to the bare filename so the modal can attempt the
    // RPC and surface a proper error if the file doesn't exist.
    const match = findAgentFileMatch(href, files);
    const fileName = match?.name ?? extractBareHref(href) ?? href;
    return (
      <Text
        key={node.key}
        style={linkStyle}
        accessibilityRole="link"
        onPress={() => onOpenFile(fileName)}
      >
        {children}
      </Text>
    );
  };
}

// ---------------------------------------------------------------------------
// Segmented streaming markdown
//
// When an assistant message is streaming, we want a smooth typewriter reveal
// (driven by `useStreamReveal` at ~15Hz) without re-tokenizing the entire
// growing string through markdown-it on every frame. We split the rendered
// content at the last paragraph boundary into:
//
//   - a STABLE PREFIX (everything up to the final `\n\n` or `\n` for long text)
//   - an ACTIVE TAIL (the paragraph currently being typed)
//
// The stable prefix is wrapped in `React.memo` and only re-renders when the
// caller crosses a new paragraph boundary. The tail re-renders at typewriter
// rate but its size is bounded, so per-frame markdown work stays small.
// ---------------------------------------------------------------------------

interface SegmentedMarkdown {
  stable: string;
  tail: string;
}

function splitForSegmentedRender(text: string): SegmentedMarkdown {
  // Never split inside an unclosed code fence — both halves would re-parse
  // with mismatched fence state and the formatting would tear.
  if (hasUnclosedFence(text)) {
    return { stable: '', tail: text };
  }

  // Primary: paragraph boundary (\n\n) — cleanest visual split.
  const lastDoubleBreak = text.lastIndexOf('\n\n');
  if (lastDoubleBreak > 0) {
    return {
      stable: text.slice(0, lastDoubleBreak + 2),
      tail: text.slice(lastDoubleBreak + 2),
    };
  }

  // Fallback for long single-paragraph streams: split at last single newline.
  // With breaks:false, a \n is whitespace in markdown-it, but since both halves
  // go through separate <Markdown> blocks the split causes a visual paragraph
  // boundary — acceptable for list items, headings, etc. Only applied when
  // the text is long enough that reducing tail re-parse cost outweighs the minor
  // visual fidelity difference.
  if (text.length > 800) {
    const lastBreak = text.lastIndexOf('\n');
    if (lastBreak > 0) {
      return {
        stable: text.slice(0, lastBreak + 1),
        tail: text.slice(lastBreak + 1),
      };
    }
  }

  return { stable: '', tail: text };
}

// Stable noop so the library's internal useMemo (which keys on onLinkPress
// among other props) doesn't re-create the AstRenderer on every parent
// render. Inline `() => false` would defeat that memoization.
const NOOP_ON_LINK_PRESS = (): boolean => false;

// ---------------------------------------------------------------------------
// CachedMarkdown — thin wrapper around the markdown library that reuses a
// pre-parsed AST when one is available in the module-level LRU cache (see
// src/utils/markdownCache.ts). Mounting bubbles after a FlatList recycle hits
// the cache and skips the markdown-it parse + cleanup pipeline entirely.
//
// `cacheable` is gated by the caller: stable history content + segmented
// stable prefixes are cacheable; the streaming tail (content changes per RAF
// tick) is not, since caching it would thrash the LRU.
// ---------------------------------------------------------------------------

interface CachedMarkdownProps {
  content: string;
  cacheable: boolean;
  markdownStyles: MarkdownStyles;
  rules: object;
}

function CachedMarkdown({
  content,
  cacheable,
  markdownStyles,
  rules,
}: CachedMarkdownProps): React.JSX.Element {
  const cachedAst = cacheable ? getCachedMarkdownAst(content, chatMarkdownIt) : null;
  // The library accepts either a raw string (which it parses) or a
  // pre-parsed AST array (which it short-circuits). The TypeScript types
  // declare `children: string`, so we cast through unknown when handing in
  // an array. The runtime contract is documented in node_modules/.../parser.js.
  const children = (cachedAst ?? content) as unknown as string;
  return (
    <Markdown
      style={markdownStyles}
      markdownit={chatMarkdownIt}
      rules={rules}
      onLinkPress={NOOP_ON_LINK_PRESS}
    >
      {children}
    </Markdown>
  );
}

interface StableMarkdownPrefixProps {
  content: string;
  markdownStyles: MarkdownStyles;
  rules: object;
}

const StableMarkdownPrefix = React.memo(function StableMarkdownPrefix({
  content,
  markdownStyles,
  rules,
}: StableMarkdownPrefixProps): React.JSX.Element {
  return (
    <CachedMarkdown
      content={content}
      cacheable
      markdownStyles={markdownStyles}
      rules={rules}
    />
  );
});


// ---------------------------------------------------------------------------
// MessageBlocks — owns internalBlockHeights state so layout updates here
// do NOT re-render the Markdown body below.
// ---------------------------------------------------------------------------

interface MessageBlocksProps {
  thinking: ChatUiThinkingBlock[] | undefined;
  toolCalls: ChatUiToolCall[] | undefined;
  showThinking: boolean;
  showToolCalls: boolean;
  isStreaming: boolean;
}

const MessageBlocks = React.memo(function MessageBlocks({
  thinking,
  toolCalls,
  showThinking,
  showToolCalls,
  isStreaming,
}: MessageBlocksProps): React.JSX.Element | null {
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  // Buffer height updates during streaming so connector-line positioning
  // doesn't cause a setState cascade on every thinking-text layout change.
  const heightBufferRef = useRef<Record<string, number>>({});
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const recordBlockHeight = useCallback((id: string, height: number): void => {
    const n = Math.round(height);
    heightBufferRef.current[id] = n;
    if (!isStreamingRef.current) {
      setBlockHeights((prev) => {
        if (prev[id] === n) return prev;
        return { ...prev, [id]: n };
      });
    }
  }, []);

  // Flush buffered heights when streaming ends so connectors draw correctly.
  useEffect(() => {
    if (!isStreaming) {
      const buf = heightBufferRef.current;
      if (Object.keys(buf).length > 0) {
        setBlockHeights((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [id, n] of Object.entries(buf)) {
            if (next[id] !== n) { next[id] = n; changed = true; }
          }
          return changed ? next : prev;
        });
      }
    }
  }, [isStreaming]);

  const hasThinking = showThinking && thinking && thinking.length > 0;
  const hasToolCalls = showToolCalls && toolCalls && toolCalls.length > 0;
  if (!hasThinking && !hasToolCalls) return null;

  return (
    <View style={styles.blocks}>
      {hasThinking
        ? thinking.map((t, index, arr) => {
            const prevId = index > 0 ? arr[index - 1]?.id : undefined;
            const previousBlockHeight = prevId ? blockHeights[prevId] : undefined;
            return (
              <View
                key={t.id}
                onLayout={(e) => recordBlockHeight(t.id, e.nativeEvent.layout.height)}
              >
                <ThinkingNode
                  thinking={t}
                  isActive={Boolean(isStreaming && index === arr.length - 1)}
                  showConnector={index > 0}
                  previousBlockHeight={previousBlockHeight}
                />
              </View>
            );
          })
        : null}
      {hasToolCalls
        ? toolCalls.map((tc, index, arr) => {
            const hasBefore = Boolean(hasThinking) || index > 0;
            let prevId: string | undefined;
            if (index > 0) {
              prevId = arr[index - 1]?.id;
            } else if (thinking != null && thinking.length > 0) {
              prevId = thinking[thinking.length - 1]?.id;
            }
            const previousBlockHeight = prevId ? blockHeights[prevId] : undefined;
            return (
              <View
                key={tc.id}
                onLayout={(e) => recordBlockHeight(tc.id, e.nativeEvent.layout.height)}
              >
                <ToolCallCard
                  toolCall={tc}
                  showConnector={hasBefore}
                  previousBlockHeight={previousBlockHeight}
                />
              </View>
            );
          })
        : null}
    </View>
  );
});

// ---------------------------------------------------------------------------
// StreamingTextPart — a single text part rendered through <Markdown>.
// Extracted into its own component so useStreamReveal (a hook) can be
// called unconditionally, since hooks cannot be called inside a loop.
// ---------------------------------------------------------------------------

interface StreamingTextPartProps {
  text: string;
  isStreamingTail: boolean;
  markdownStyles: MarkdownStyles;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  colors: ThemeColors;
}

const StreamingTextPart = React.memo(function StreamingTextPart({
  text,
  isStreamingTail,
  markdownStyles,
  files,
  onOpenFile,
  colors,
}: StreamingTextPartProps): React.JSX.Element | null {
  // Reveal text via typewriter smoothing while streaming. When the tail flips
  // to false (stream ended or a new part follows), snaps immediately so no
  // stale "stuck on penultimate chunk" issue.
  const revealedText = useStreamReveal(text, isStreamingTail);

  const isTyping = isStreamingTail && !text;
  // Strip any clawboy:options comment (complete or still-streaming/malformed)
  // before markdown rendering so the raw JSON is never visible in the bubble.
  // Memoized so the O(n) strip doesn't re-run on every typewriter tick
  // when the revealed prefix hasn't changed.
  const trimmed = useMemo(
    () => stripClawboyOptionsForRender(revealedText.trimEnd()),
    [revealedText],
  );

  // Use the inline sentinel cursor unless the revealed text ends inside an
  // unclosed code fence (sentinel would appear inside the code block).
  const useSentinel = isStreamingTail && trimmed.length > 0 && !hasUnclosedFence(trimmed);
  const useFallbackCursor = isStreamingTail && trimmed.length > 0 && !useSentinel;
  const textForMarkdown = useSentinel ? trimmed + CURSOR_SENTINEL : trimmed;

  // Memoized rules — the text rule only changes when cursor presence or color changes.
  const cursorColor = colors.foreground;
  const rules = useMemo(() => ({
    fence: (node: { key?: string; content: string; sourceInfo?: string }) => markdownFenceRule(node),
    paragraph: makeParagraphRule(markdownStyles.paragraph),
    link: makeLinkRule(files, onOpenFile, markdownStyles.link, markdownStyles.text),
    ...(useSentinel ? {
      text: (
        node: { key?: string; content?: string },
        _children: React.ReactNode,
        _parent: unknown,
        _styles: object,
        inheritedStyles: object = {},
      ) => {
        const content = String(node.content ?? '');
        const idx = content.indexOf(CURSOR_SENTINEL);
        if (idx === -1) {
          return <Text key={node.key} style={[inheritedStyles, markdownStyles.text]}>{content}</Text>;
        }
        return (
          <Text key={node.key} style={[inheritedStyles, markdownStyles.text]}>
            {content.slice(0, idx)}
            <StreamingCursor color={cursorColor} />
          </Text>
        );
      },
    } : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [useSentinel, cursorColor, markdownStyles.paragraph, markdownStyles.text, markdownStyles.link, files, onOpenFile]);

  // Split into a memoizable stable prefix + an active tail. The prefix only
  // re-renders when its underlying string changes (i.e. when typewriter reveal
  // crosses a paragraph boundary), bounding per-frame markdown work to the
  // length of the active tail.
  const { stable, tail } = useMemo(
    () => splitForSegmentedRender(textForMarkdown),
    [textForMarkdown],
  );

  if (!trimmed && !isTyping) return null;

  return (
    <View style={[styles.bubble, styles.aiBubble]}>
      {isTyping ? (
        <StreamingText />
      ) : (
        <ErrorBoundary fallback={() => <MarkdownErrorFallback content={trimmed} />}>
          {stable.length > 0 ? (
            <StableMarkdownPrefix content={stable} markdownStyles={markdownStyles} rules={rules} />
          ) : null}
          {tail.length > 0 ? (
            <CachedMarkdown
              content={tail}
              cacheable={!isStreamingTail}
              markdownStyles={markdownStyles}
              rules={rules}
            />
          ) : null}
          {useFallbackCursor && <StreamingCursor color={cursorColor} />}
        </ErrorBoundary>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// MessageParts — renders an ordered parts array (live streaming path).
// Thinking nodes, tool cards, and text blocks appear in true arrival order.
// Falls back to MessageBlocks + MessageBody when parts are absent (history).
// ---------------------------------------------------------------------------

interface MessagePartsProps {
  parts: ChatUiMessagePart[];
  isStreaming: boolean;
  showThinking: boolean;
  showToolCalls: boolean;
  colors: ThemeColors;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  markdownStyles: MarkdownStyles;
}

const MessageParts = React.memo(function MessageParts({
  parts,
  isStreaming,
  showThinking,
  showToolCalls,
  colors,
  files,
  onOpenFile,
  markdownStyles,
}: MessagePartsProps): React.JSX.Element | null {
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  const heightBufferRef = useRef<Record<string, number>>({});
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const recordBlockHeight = useCallback((id: string, height: number): void => {
    const n = Math.round(height);
    heightBufferRef.current[id] = n;
    if (!isStreamingRef.current) {
      setBlockHeights((prev) => {
        if (prev[id] === n) return prev;
        return { ...prev, [id]: n };
      });
    }
  }, []);

  useEffect(() => {
    if (!isStreaming) {
      const buf = heightBufferRef.current;
      if (Object.keys(buf).length > 0) {
        setBlockHeights((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [id, n] of Object.entries(buf)) {
            if (next[id] !== n) { next[id] = n; changed = true; }
          }
          return changed ? next : prev;
        });
      }
    }
  }, [isStreaming]);

  if (parts.length === 0) return null;

  const elements: React.JSX.Element[] = [];
  let prevVisibleInternalId: string | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!part) continue;

    if (part.kind === 'thinking') {
      if (!showThinking) continue;
      const showConnector = prevVisibleInternalId !== undefined;
      const prevId = prevVisibleInternalId;
      prevVisibleInternalId = part.id;

      const thinkingBlock: ChatUiThinkingBlock = {
        id: part.id,
        content: part.text,
        isExpanded: false,
        duration: part.duration,
      };
      elements.push(
        <View
          key={part.id}
          onLayout={(e) => recordBlockHeight(part.id, e.nativeEvent.layout.height)}
        >
          <ThinkingNode
            thinking={thinkingBlock}
            isActive={part.isActive && isStreaming}
            showConnector={showConnector}
            previousBlockHeight={prevId ? blockHeights[prevId] : undefined}
          />
        </View>
      );
      continue;
    }

    if (part.kind === 'tool') {
      if (!showToolCalls) continue;
      const showConnector = prevVisibleInternalId !== undefined;
      const prevId = prevVisibleInternalId;
      prevVisibleInternalId = part.id;

      elements.push(
        <View
          key={part.id}
          onLayout={(e) => recordBlockHeight(part.id, e.nativeEvent.layout.height)}
        >
          <ToolCallCard
            toolCall={part.toolCall}
            showConnector={showConnector}
            previousBlockHeight={prevId ? blockHeights[prevId] : undefined}
            duration={part.duration}
          />
        </View>
      );
      continue;
    }

    if (part.kind === 'text') {
      // Text breaks the connector chain between internal blocks.
      prevVisibleInternalId = undefined;
      const isLastPart = i === parts.length - 1;
      // The streaming tail is the last text part while the stream is still open.
      // When it's no longer the tail (a new part follows, or streaming ends),
      // StreamingTextPart flushes immediately via delayMs=0.
      const isStreamingTail = isStreaming && isLastPart;
      const trimmed = part.text.trimEnd();
      if (!trimmed && !isStreamingTail) continue;

      elements.push(
        <StreamingTextPart
          key={part.id}
          text={part.text}
          isStreamingTail={isStreamingTail}
          markdownStyles={markdownStyles}
          files={files}
          onOpenFile={onOpenFile}
          colors={colors}
        />
      );
    }
  }

  return elements.length > 0 ? <>{elements}</> : null;
});

// ---------------------------------------------------------------------------
// MessageBody — memoized so it only re-renders when content or colors change,
// not when block layout heights update in MessageBlocks above.
// ---------------------------------------------------------------------------

// Stable module-level fallback so React.memo on MessageBubble stays effective.
function MarkdownErrorFallback({ content }: { content: string }): React.JSX.Element {
  const { t } = useTranslation();
  const onLongPress = useCallback(async () => {
    if (content) await Clipboard.setStringAsync(content);
  }, [content]);

  return (
    <Pressable onLongPress={onLongPress} accessibilityLabel={t('chat.message.markdownErrorLabel')}>
      <Text style={styles.markdownError}>
        {t('chat.message.markdownError')}
      </Text>
    </Pressable>
  );
}

interface MessageBodyProps {
  content: string;
  isTyping: boolean;
  isUser: boolean;
  isStreaming: boolean;
  colors: ThemeColors;
  files: AgentFile[];
  onOpenFile: (name: string) => void;
  markdownStyles: MarkdownStyles;
}

const MessageBody = React.memo(function MessageBody({
  content,
  isTyping,
  isUser,
  isStreaming,
  colors,
  files,
  onOpenFile,
  markdownStyles,
}: MessageBodyProps): React.JSX.Element | null {
  // Reveal text via typewriter smoothing while the assistant is streaming.
  // When streaming ends, snaps to the full content in the same React commit.
  const isAssistantStreaming = isStreaming && !isUser;
  const revealedContent = useStreamReveal(content, isAssistantStreaming);
  // Strip any clawboy:options comment (complete or still-streaming/malformed)
  // before markdown rendering so the raw JSON is never visible in the bubble.
  // Memoized so the O(n) strip doesn't re-run on every typewriter tick
  // when the revealed prefix hasn't changed.
  const trimmed = useMemo(
    () => stripClawboyOptionsForRender(revealedContent.trimEnd()),
    [revealedContent],
  );

  // Use the inline sentinel cursor unless the revealed text ends inside an
  // unclosed code fence (sentinel would appear inside the code block).
  const useSentinel = isAssistantStreaming && trimmed.length > 0 && !hasUnclosedFence(trimmed);
  const useFallbackCursor = isAssistantStreaming && trimmed.length > 0 && !useSentinel;
  const textForMarkdown = useSentinel ? trimmed + CURSOR_SENTINEL : trimmed;

  // Memoized rules — only changes when cursor presence, foreground color, or file list changes.
  const cursorColor = colors.foreground;
  const rules = useMemo(() => ({
    fence: (node: { key?: string; content: string; sourceInfo?: string }) => markdownFenceRule(node),
    paragraph: makeParagraphRule(markdownStyles.paragraph),
    link: makeLinkRule(files, onOpenFile, markdownStyles.link, markdownStyles.text),
    ...(useSentinel ? {
      text: (
        node: { key?: string; content?: string },
        _children: React.ReactNode,
        _parent: unknown,
        _styles: object,
        inheritedStyles: object = {},
      ) => {
        const content = String(node.content ?? '');
        const idx = content.indexOf(CURSOR_SENTINEL);
        if (idx === -1) {
          return <Text key={node.key} style={[inheritedStyles, markdownStyles.text]}>{content}</Text>;
        }
        return (
          <Text key={node.key} style={[inheritedStyles, markdownStyles.text]}>
            {content.slice(0, idx)}
            <StreamingCursor color={cursorColor} />
          </Text>
        );
      },
    } : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [useSentinel, cursorColor, markdownStyles.paragraph, markdownStyles.text, markdownStyles.link, files, onOpenFile]);

  // Same segmentation as StreamingTextPart — bounds per-frame markdown work
  // to the active paragraph length while still streaming through the full
  // markdown pipeline (so headers/lists/links keep formatting live).
  const { stable, tail } = useMemo(
    () => splitForSegmentedRender(textForMarkdown),
    [textForMarkdown],
  );

  if (!trimmed && !isTyping) return null;

  return (
    <View
      style={[
        styles.bubble,
        isUser
          ? [styles.userBubble, { backgroundColor: colors.userBubble }]
          : styles.aiBubble,
      ]}
    >
      {isTyping ? (
        <StreamingText />
      ) : (
        <ErrorBoundary fallback={() => <MarkdownErrorFallback content={trimmed} />}>
          {stable.length > 0 ? (
            <StableMarkdownPrefix content={stable} markdownStyles={markdownStyles} rules={rules} />
          ) : null}
          {tail.length > 0 ? (
            <CachedMarkdown
              content={tail}
              cacheable={!isAssistantStreaming}
              markdownStyles={markdownStyles}
              rules={rules}
            />
          ) : null}
          {useFallbackCursor && <StreamingCursor color={cursorColor} />}
        </ErrorBoundary>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// MessageBubbleActions — isolated subcomponent holding useTranslation so
// locale changes do NOT re-render the markdown content area above.
// ---------------------------------------------------------------------------

interface MessageBubbleActionsProps {
  isUser: boolean;
  trimmedContent: string;
  timestamp: Date;
  copied: boolean;
  speaking: boolean;
  interrupted: boolean | undefined;
  onCopy: () => void;
  onSpeak: (() => void) | undefined;
  onRetry: (() => void) | undefined;
  onAnnotate: (() => void) | undefined;
  /** When true, the annotate icon becomes a "Done" pill to exit annotate mode. */
  annotateMode?: boolean;
  colors: ThemeColors;
}

const MessageBubbleActions = React.memo(function MessageBubbleActions({
  isUser,
  trimmedContent,
  timestamp,
  copied,
  speaking,
  interrupted,
  onCopy,
  onSpeak,
  onRetry,
  onAnnotate,
  annotateMode = false,
  colors,
}: MessageBubbleActionsProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      {interrupted && !isUser ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.interruptedPill,
            { backgroundColor: colors.secondary, borderColor: colors.warning ?? '#F59E0B' },
            pressed && { opacity: 0.75 },
          ]}
          hitSlop={6}
          accessibilityLabel={t('chat.message.retryLabel')}
          accessibilityRole="button"
        >
          <AlertTriangle size={11} color={colors.warning ?? '#F59E0B'} />
          <Text style={[styles.interruptedText, { color: colors.warning ?? '#F59E0B' }]}>
            {t('chat.message.interrupted')}
          </Text>
          {onRetry ? (
            <>
              <View style={[styles.interruptedDivider, { backgroundColor: colors.warning ?? '#F59E0B' }]} />
              <RotateCcw size={11} color={colors.warning ?? '#F59E0B'} />
              <Text style={[styles.interruptedText, { color: colors.warning ?? '#F59E0B' }]}>
                {t('chat.message.retry')}
              </Text>
            </>
          ) : null}
        </Pressable>
      ) : null}

      <View style={[styles.meta, isUser ? styles.metaEnd : styles.metaStart]}>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {formatMessageTime(timestamp)}
        </Text>
        {trimmedContent ? (
          <Pressable
            onPress={onCopy}
            hitSlop={10}
            style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('chat.message.copyLabel')}
            accessibilityRole="button"
          >
            {copied ? (
              <Check size={14} color={colors.success} />
            ) : (
              <Copy size={14} color="rgba(139, 139, 139, 0.5)" />
            )}
          </Pressable>
        ) : null}
        {!isUser && trimmedContent && onSpeak ? (
          <Pressable
            onPress={onSpeak}
            hitSlop={10}
            style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={speaking ? t('chat.message.stopSpeaking') : t('chat.message.readAloud')}
            accessibilityRole="button"
          >
            {speaking ? (
              <VolumeX size={14} color={colors.primary} />
            ) : (
              <Volume2 size={14} color="rgba(139, 139, 139, 0.5)" />
            )}
          </Pressable>
        ) : null}
        {!isUser && trimmedContent && onAnnotate ? (
          <Pressable
            onPress={onAnnotate}
            hitSlop={10}
            style={({ pressed }) => [
              styles.copyBtn,
              annotateMode && {
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: `${colors.primary}20`,
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={annotateMode ? t('chat.annotate.doneAnnotating') : t('chat.annotate.iconLabel')}
            accessibilityRole="button"
          >
            {annotateMode ? (
              <Text style={[styles.doneText, { color: colors.primary }]}>
                {t('chat.annotate.doneAnnotating')}
              </Text>
            ) : (
              <MessageSquarePlus size={14} color="rgba(139, 139, 139, 0.5)" />
            )}
          </Pressable>
        ) : null}
      </View>
    </>
  );
});

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatUiMessage;
  showThinking?: boolean;
  showToolCalls?: boolean;
  onRetry?: (assistantMessageId: string) => void;
  onSpeak?: (message: ChatUiMessage) => void;
  /** Called when the user taps a survey choice or submits free-form reply text. */
  onReplyToPrompt?: (value: string) => void;
  /**
   * Called when the user long-presses or taps the annotate icon on an assistant
   * bubble. When annotateMode is false this enters annotate mode; when true it exits.
   */
  onAnnotate?: (message: ChatUiMessage) => void;
  /**
   * When true the bubble renders as an AnnotatedMessageBody (section list with
   * inline reply slots) instead of normal markdown. Only set for one message at
   * a time from the parent. Guard: non-streaming, has content.
   */
  annotateMode?: boolean;
  /**
   * Annotation id that should flash to indicate it is the current pill-cycle
   * target. Forwarded to AnnotatedMessageBody → InlineAnnotationRow.
   */
  highlightedAnnotationId?: string | null;
  /** When false, skips the FadeInUp entering animation (bulk loads, session switches). */
  animateOnMount?: boolean;
  /**
   * Hoisted from MessageList — agent workspace files for in-app link resolution.
   * Passing from the parent avoids 1 useAgents + 1 useAgentFiles call per bubble.
   */
  files: AgentFile[];
  /**
   * Hoisted from MessageList — opens the in-app file viewer modal.
   * Passing from parent avoids 1 useFileViewer call per bubble.
   */
  onOpenFile: (name: string) => void;
  /**
   * Hoisted from MessageList — pre-computed markdown styles for the active
   * theme + density. Avoids 1 useTokens + 1 useMemo per bubble.
   */
  markdownStyles: MarkdownStyles;
  /**
   * Hoisted from MessageList — active theme colors. Avoids 1 useTheme per bubble.
   */
  colors: ThemeColors;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  showThinking = true,
  showToolCalls = true,
  onRetry,
  onSpeak,
  onReplyToPrompt,
  onAnnotate,
  annotateMode = false,
  highlightedAnnotationId = null,
  animateOnMount = true,
  files,
  onOpenFile,
  markdownStyles,
  colors,
}: MessageBubbleProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const isUser = message.role === 'user';
  // Show typing dots only when streaming has started but no prose has arrived yet.
  // When parts are present, MessageParts handles typing-dot rendering per text part.
  const hasParts = !isUser && Boolean(message.parts?.length);
  const trimmedContent = message.content?.trim() ?? '';
  const hasVisibleBody =
    Boolean(trimmedContent) ||
    Boolean(message.images?.length) ||
    Boolean(message.fileAttachments?.length) ||
    Boolean(message.files?.length) ||
    Boolean(message.audioUrl) ||
    Boolean(message.videoUrl);
  const isTyping = Boolean(message.isStreaming && !hasVisibleBody && !hasParts);

  const onCopy = useCallback(async () => {
    if (!trimmedContent) return;
    // Strip any partially-streamed or malformed directive so it never lands in clipboard.
    await Clipboard.setStringAsync(stripClawboyOptionsForRender(trimmedContent));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [trimmedContent]);

  const handleRetry = useCallback(() => {
    onRetry?.(message.id);
  }, [onRetry, message.id]);

  const handleSpeak = useCallback((): void => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    onSpeak?.(message);
    // Reset indicator after 4 s max — actual speech duration varies
    setTimeout(() => setSpeaking(false), 4000);
  }, [speaking, onSpeak, message]);

  const handleAnnotate = useCallback((): void => {
    onAnnotate?.(message);
  }, [onAnnotate, message]);

  // Annotation eligibility: non-streaming, has text content, handler provided.
  const canAnnotate = !isUser && !message.isStreaming && Boolean(trimmedContent) && Boolean(onAnnotate);
  // Active annotate mode: canAnnotate guard + explicit prop flag.
  const isAnnotating = canAnnotate && annotateMode;

  const normalBubbleContent = (
    <>
      {hasParts ? (
        <MessageParts
          parts={message.parts!}
          isStreaming={Boolean(message.isStreaming)}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          colors={colors}
          files={files}
          onOpenFile={onOpenFile}
          markdownStyles={markdownStyles}
        />
      ) : (
        <>
          <MessageBlocks
            thinking={message.thinking}
            toolCalls={message.toolCalls}
            showThinking={showThinking}
            showToolCalls={showToolCalls}
            isStreaming={Boolean(message.isStreaming)}
          />
          <MessageBody
            content={message.content}
            isTyping={isTyping}
            isUser={isUser}
            isStreaming={Boolean(message.isStreaming)}
            colors={colors}
            files={files}
            onOpenFile={onOpenFile}
            markdownStyles={markdownStyles}
          />
        </>
      )}

      {!hasParts &&
      isUser &&
      message.fileAttachments &&
      message.fileAttachments.length > 0 ? (
        <View style={[styles.fileAttachRow, styles.alignEnd]}>
          {message.fileAttachments.map((f, i) => (
            <View
              key={`${f.name}-${String(i)}`}
              style={[
                styles.fileAttachPill,
                { backgroundColor: colors.userBubble, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.fileAttachText, { color: colors.foreground }]} numberOfLines={1}>
                {f.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <MediaEmbed
        images={message.images}
        audioUrl={message.audioUrl}
        videoUrl={message.videoUrl}
        align={isUser ? 'right' : 'left'}
        guessedMedia={message.guessedMedia}
      />

      {message.files && message.files.length > 0 ? (
        <View style={isUser ? styles.alignEnd : styles.alignStart}>
          {message.files.map((f, i) => (
            <FileAttachmentCard key={`${f.url}-${String(i)}`} file={f} guessedMedia={message.guessedMedia} />
          ))}
        </View>
      ) : null}

      {!isUser && message.interactive && onReplyToPrompt ? (
        <InteractiveOptionsCard
          prompt={message.interactive}
          surveyState={message.surveyState ?? { consumed: false }}
          disabled={Boolean(message.isStreaming)}
          onPick={onReplyToPrompt}
          onSubmitFreeText={onReplyToPrompt}
        />
      ) : null}
    </>
  );

  return (
    <Animated.View
      entering={animateOnMount ? FadeInUp.duration(200) : undefined}
      style={[styles.col, isUser ? styles.alignEnd : styles.alignStart]}
    >
      {isAnnotating ? (
        // Annotate mode: show full sectioned body with inline reply slots.
        // No long-press gesture wrapper — tapping sections/affordances has its own handlers.
        <View style={styles.annotateGestureTarget}>
          <AnnotatedMessageBody
            message={message}
            markdownStyles={markdownStyles}
            files={files}
            onOpenFile={onOpenFile}
            colors={colors}
            highlightedAnnotationId={highlightedAnnotationId}
          />
        </View>
      ) : canAnnotate ? (
        <Pressable
          onLongPress={handleAnnotate}
          delayLongPress={400}
          style={styles.annotateGestureTarget}
        >
          {normalBubbleContent}
        </Pressable>
      ) : (
        normalBubbleContent
      )}

      <MessageBubbleActions
        isUser={isUser}
        trimmedContent={trimmedContent}
        timestamp={message.timestamp}
        copied={copied}
        speaking={speaking}
        interrupted={message.interrupted}
        onCopy={onCopy}
        onSpeak={onSpeak ? handleSpeak : undefined}
        onRetry={onRetry ? handleRetry : undefined}
        onAnnotate={canAnnotate ? handleAnnotate : undefined}
        annotateMode={isAnnotating}
        colors={colors}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  col: {
    gap: Spacing.sm,
    width: '100%',
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  blocks: {
    width: '100%',
    maxWidth: '92%',
    gap: 4,
  },
  bubble: {
    maxWidth: '92%',
  },
  userBubble: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius['2xl'],
    borderBottomRightRadius: BorderRadius.md,
  },
  aiBubble: {
    paddingVertical: 2,
  },
  annotateGestureTarget: {
    width: '100%',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  fileAttachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    maxWidth: '92%',
  },
  fileAttachPill: {
    maxWidth: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  fileAttachText: {
    fontSize: FontSize.sm,
  },
  metaStart: {
    flexDirection: 'row',
  },
  metaEnd: {
    flexDirection: 'row-reverse',
  },
  time: {
    fontSize: FontSize.xs,
  },
  copyBtn: {
    padding: 2,
    borderRadius: 4,
  },
  interruptedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  interruptedText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  interruptedDivider: {
    width: 1,
    height: 10,
    opacity: 0.4,
    marginHorizontal: 2,
  },
  markdownError: {
    fontSize: FontSize.xs,
    color: 'rgba(168, 85, 247, 0.7)',
    fontStyle: 'italic',
  },
  doneText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
