import React, { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat';
import { InputBar } from '@/components/input/InputBar';
import { SessionSidebar } from '@/components/sidebar';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { demoMessages, demoMessagesStreaming } from '@/data/chat-demo';
import { mockSessions as initialMockSessions } from '@/data/mock-sessions';
import { APP_VERSION } from '@/lib/appMeta';
import { generateUUID } from '@/lib/openclaw/utils';

export default function ChatScreen(): React.JSX.Element {
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState(initialMockSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialMockSessions[0]?.id ?? null
  );

  const [showThinking, setShowThinking] = useState(true);
  const [showToolCalls, setShowToolCalls] = useState(true);
  const [useStreamingDemo, setUseStreamingDemo] = useState(false);
  const [isThinkingDemo, setIsThinkingDemo] = useState(false);
  const messages = useStreamingDemo ? demoMessagesStreaming : demoMessages;

  const onSend = useCallback((_message: string, _attachments?: unknown): void => {
    /* Mock — Prompt 9 wires gateway */
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardRoot}
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
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>Thinking UI {showThinking ? 'on' : 'off'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowToolCalls((s) => !s)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>Tools {showToolCalls ? 'on' : 'off'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setUseStreamingDemo((s) => !s)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>
                {useStreamingDemo ? 'Streaming demo' : 'Full demo'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIsThinkingDemo((s) => !s)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>Input glow {isThinkingDemo ? 'on' : 'off'}</Text>
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
    backgroundColor: Colors.dark.background,
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
    backgroundColor: Colors.dark.secondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.dark.mutedForeground,
  },
});
