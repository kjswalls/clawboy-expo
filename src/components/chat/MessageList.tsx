import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import type { ChatUiMessage } from '@/types/chat-ui';

import { MessageBubble } from './MessageBubble';

const ITEM_GAP = 16;
const SCROLL_UP_THRESHOLD = 100;
const NEAR_BOTTOM = 50;
const BUTTON_SHOW_DISTANCE = 200;

interface MessageListProps {
  messages: ChatUiMessage[];
  showThinking?: boolean;
  showToolCalls?: boolean;
}

export function MessageList({
  messages,
  showThinking = true,
  showToolCalls = true,
}: MessageListProps): React.JSX.Element {
  const { colors, theme } = useTheme();
  const listRef = useRef<FlatList<ChatUiMessage>>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  const prevCountRef = useRef(messages.length);
  const prevContentHeightRef = useRef(0);
  const isAutoScrollingRef = useRef(false);

  const latestAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === 'assistant') {
        return m.id;
      }
    }
    return null;
  }, [messages]);

  const ordered = useMemo(() => [...messages].reverse(), [messages]);

  const scrollToBottom = useCallback((animated: boolean) => {
    isAutoScrollingRef.current = true;
    listRef.current?.scrollToOffset({ offset: 0, animated });
    setHasNewMessages(false);
    setUserHasScrolledUp(false);
    setTimeout(
      () => {
        isAutoScrollingRef.current = false;
      },
      animated ? 320 : 60,
    );
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (messages.length > prevCountRef.current) {
      if (last?.role === 'user') {
        setUserHasScrolledUp(false);
        setHasNewMessages(false);
        requestAnimationFrame(() => scrollToBottom(false));
      } else if (userHasScrolledUp && last?.role === 'assistant') {
        setHasNewMessages(true);
      }
    }
    prevCountRef.current = messages.length;
  }, [messages, scrollToBottom, userHasScrolledUp]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setShowTopFade(y > 10);
      setShowScrollBtn(y > BUTTON_SHOW_DISTANCE);

      if (!isAutoScrollingRef.current && y > SCROLL_UP_THRESHOLD) {
        setUserHasScrolledUp(true);
      }
      if (y < NEAR_BOTTOM) {
        setHasNewMessages(false);
        setUserHasScrolledUp(false);
      }
    },
    [],
  );

  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      const prev = prevContentHeightRef.current;
      // Always update the baseline so decreasing content (session reset, etc.) doesn't
      // leave a stale high-water mark that blocks future snaps.
      prevContentHeightRef.current = h;

      // Only react to meaningful growth (>1px avoids reacting to sub-pixel layout
      // jitter from the two-pass ScrollView measurement in CodeBlock).
      if (h <= prev + 1) return;

      if (userHasScrolledUp) {
        setHasNewMessages(true);
      } else {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    },
    [userHasScrolledUp],
  );

  const renderItem: ListRenderItem<ChatUiMessage> = useCallback(
    ({ item }) => (
      <MessageBubble
        message={item}
        isLatestAssistant={item.role === 'assistant' && item.id === latestAssistantId}
        showThinking={showThinking}
        showToolCalls={showToolCalls}
      />
    ),
    [latestAssistantId, showThinking, showToolCalls],
  );

  const keyExtractor = useCallback((item: ChatUiMessage) => item.id, []);

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (hasNewMessages && showScrollBtn) {
      pulse.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 500 }), withTiming(1, { duration: 500 })),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [hasNewMessages, showScrollBtn, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
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
          colors={
            theme === 'dark'
              ? ['rgba(0,0,0,0.65)', 'transparent']
              : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.0)']
          }
          style={StyleSheet.absoluteFill}
        />
      </View>

      <FlatList
        ref={listRef}
        data={ordered}
        inverted
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={onContentSizeChange}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={ItemSep}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />

      <View
        style={[styles.scrollBtnWrap, { opacity: showScrollBtn ? 1 : 0 }]}
        pointerEvents={showScrollBtn ? 'auto' : 'none'}
      >
        <Pressable
          onPress={() => scrollToBottom(true)}
          style={({ pressed }) => [styles.scrollBtn, { backgroundColor: colors.secondary, borderColor: colors.border }, pressed && { opacity: 0.85 }]}
        >
          {hasNewMessages ? (
            <Animated.View style={[styles.newDot, { backgroundColor: colors.primary }, dotStyle]} />
          ) : null}
          <ArrowDown size={14} color={colors.foreground} />
          <Text style={[styles.scrollLabel, { color: colors.foreground }]}>
            {hasNewMessages ? 'New messages' : 'Scroll to bottom'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

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
});
