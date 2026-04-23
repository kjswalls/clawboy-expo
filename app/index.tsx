import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat';
import { InputBar } from '@/components/input/InputBar';
import { SessionSidebar } from '@/components/sidebar';
import { FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { demoMessages, demoMessagesStreaming } from '@/data/chat-demo';
import { mockSessions as initialMockSessions } from '@/data/mock-sessions';
import { APP_VERSION } from '@/lib/appMeta';
import { generateUUID } from '@/lib/openclaw/utils';
import type { ChatUiMessage } from '@/types/chat-ui';

const STREAMING_FULL_CONTENT = `Here are the most impactful Next.js production optimizations:

## 1. Image Optimization

Use the built-in \`<Image>\` component — it auto-converts to WebP, lazy-loads, and serves the right size for each device:

\`\`\`tsx
import Image from 'next/image';

<Image src="/hero.png" alt="Hero" width={1200} height={630} priority />
\`\`\`

## 2. Code Splitting

Next.js splits routes automatically, but also lazy-load heavy components:

\`\`\`tsx
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <Skeleton />,
});
\`\`\`

## 3. Caching Strategy

Set \`Cache-Control\` headers in \`next.config.js\` and use React's \`cache()\` for server data fetching:

\`\`\`ts
export const getProduct = cache(async (id: string) => {
  return db.product.findUnique({ where: { id } });
});
\`\`\`

These three changes typically cut initial load time by 40–60% on real production apps.`;

const CHAR_INTERVAL_MS = 18;

function useStreamingSimulator(enabled: boolean): ChatUiMessage[] {
  const [streamedContent, setStreamedContent] = useState('');
  const [phase, setPhase] = useState<'thinking' | 'tool' | 'content' | 'done'>('thinking');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charIndexRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStreamedContent('');
      setPhase('thinking');
      charIndexRef.current = 0;
      return;
    }

    // Phase 1 — show thinking + running tool for 1.5s, then advance
    const thinkingTimer = setTimeout(() => {
      setPhase('tool');
      const toolTimer = setTimeout(() => {
        setPhase('content');
        intervalRef.current = setInterval(() => {
          const idx = charIndexRef.current;
          if (idx >= STREAMING_FULL_CONTENT.length) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            setPhase('done');
            return;
          }
          setStreamedContent(STREAMING_FULL_CONTENT.slice(0, idx + 1));
          charIndexRef.current = idx + 1;
        }, CHAR_INTERVAL_MS);
      }, 800);
      return () => clearTimeout(toolTimer);
    }, 1500);

    return () => {
      clearTimeout(thinkingTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);

  if (!enabled) return demoMessages;

  const streamingMessage: ChatUiMessage = {
    ...demoMessagesStreaming[1]!,
    content: streamedContent,
    isStreaming: phase !== 'done',
    thinking: [
      {
        id: 't1',
        content:
          'The user is asking about Next.js optimization. I should cover the most impactful areas: image optimization, code splitting, caching strategies, and build configuration...',
        isExpanded: phase === 'thinking',
      },
    ],
    toolCalls: [
      {
        id: 'tc1',
        type: 'web_search',
        name: 'Next.js optimization best practices',
        status: phase === 'thinking' || phase === 'tool' ? 'running' : 'completed',
        output: phase !== 'thinking' && phase !== 'tool'
          ? 'Found 8 relevant articles on Next.js production optimization.'
          : undefined,
      },
    ],
  };

  return [demoMessagesStreaming[0]!, streamingMessage];
}

export default function ChatScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState(initialMockSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialMockSessions[0]?.id ?? null
  );

  const [showThinking, setShowThinking] = useState(true);
  const [showToolCalls, setShowToolCalls] = useState(true);
  const [useStreamingDemo, setUseStreamingDemo] = useState(false);
  const [isThinkingDemo, setIsThinkingDemo] = useState(false);
  const messages = useStreamingSimulator(useStreamingDemo);

  const onSend = useCallback((_message: string, _attachments?: unknown): void => {
    /* Mock — Prompt 9 wires gateway */
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardRoot, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.flex}>
        <ChatHeader
          title={`ClawBoy · v${APP_VERSION}`}
          onMenuPress={() => {
            setSidebarOpen(true);
          }}
          onSettingsPress={() => {
            router.push('/settings');
          }}
        />

        <View style={styles.demoRow}>
            <Pressable
              onPress={() => setShowThinking((s) => !s)}
              style={({ pressed }) => [styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Thinking UI {showThinking ? 'on' : 'off'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowToolCalls((s) => !s)}
              style={({ pressed }) => [styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Tools {showToolCalls ? 'on' : 'off'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setUseStreamingDemo((s) => !s)}
              style={({ pressed }) => [styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, { color: colors.mutedForeground }]}>
                {useStreamingDemo ? 'Streaming demo' : 'Full demo'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIsThinkingDemo((s) => !s)}
              style={({ pressed }) => [styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Input glow {isThinkingDemo ? 'on' : 'off'}</Text>
            </Pressable>
        </View>

        <MessageList
          messages={messages}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
        />

        <InputBar
          onSend={onSend}
          isThinking={isThinkingDemo}
          onStop={() => setIsThinkingDemo(false)}
          showThinking={showThinking}
          showToolCalls={showToolCalls}
          onToggleThinking={() => setShowThinking((s) => !s)}
          onToggleToolCalls={() => setShowToolCalls((s) => !s)}
        />

        <SessionSidebar
          isOpen={sidebarOpen}
          onOpenChange={setSidebarOpen}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={() => {
            const id = generateUUID();
            setSessions((prev) => [
              {
                id,
                title: 'New chat',
                preview: '',
                updatedAt: Date.now(),
                isPinned: false,
              },
              ...prev,
            ]);
            setActiveSessionId(id);
          }}
          onPinSession={(id) => {
            setSessions((prev) =>
              prev.map((s) => (s.id === id ? { ...s, isPinned: !s.isPinned } : s))
            );
          }}
          onDeleteSession={(id) => {
            setSessions((prev) => prev.filter((s) => s.id !== id));
            setActiveSessionId((cur) => (cur === id ? null : cur));
          }}
          onRenameSession={(id, newTitle) => {
            setSessions((prev) =>
              prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
            );
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  demoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
