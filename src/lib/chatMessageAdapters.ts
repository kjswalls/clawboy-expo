import type { Agent, Session } from '@/lib/openclaw/types';
import type { DynamicPickerItem } from '@/components/input/InputBarHeader';
import type { PickerSection } from '@/components/input/InputBarPickerModal';
import { groupModelsByProvider } from '@/lib/modelProvider';
import { formatDuration } from '@/lib/formatDuration';
import type { ChatMessage, ChatToolCall, MockSession, Model } from '@/types';
import type { ChatUiMessage, ChatUiMessagePart, ChatUiThinkingBlock, ChatUiToolCall } from '@/types/chat-ui';

const TOOL_TYPE_MAP: Record<string, ChatUiToolCall['type']> = {
  read_file: 'file_read',
  read: 'file_read',
  file_read: 'file_read',
  web_search: 'web_search',
  search: 'web_search',
  browser: 'web_search',
  browse: 'web_search',
  code: 'code_execution',
  execute_code: 'code_execution',
  run_code: 'code_execution',
  image: 'image_generation',
  generate_image: 'image_generation',
};

export function inferToolType(name: string): ChatUiToolCall['type'] {
  const lower = name.toLowerCase();
  for (const [key, type] of Object.entries(TOOL_TYPE_MAP)) {
    if (lower.includes(key)) {
      return type;
    }
  }
  return 'code_execution';
}

export function adaptToolCall(tc: ChatToolCall, duration?: string): ChatUiToolCall {
  return {
    id: tc.id,
    type: inferToolType(tc.name),
    name: tc.name,
    input: tc.args ? JSON.stringify(tc.args) : undefined,
    output: tc.result,
    status: tc.status,
    duration,
  };
}

export function adaptMessage(msg: ChatMessage): ChatUiMessage {
  const thinking: ChatUiThinkingBlock[] | undefined = (() => {
    if (msg.thinkingBlocks && msg.thinkingBlocks.length > 0) {
      return msg.thinkingBlocks.map((b) => ({
        id: b.id,
        content: b.content,
        isExpanded: b.isExpanded,
      }));
    }
    if (msg.thinking) {
      return [{ id: 'thinking', content: msg.thinking, isExpanded: false }];
    }
    return undefined;
  })();

  const parts: ChatUiMessagePart[] | undefined = msg.parts?.map(
    (p): ChatUiMessagePart => {
      if (p.kind === 'text') {
        return { kind: 'text', id: p.id, text: p.text };
      }
      if (p.kind === 'thinking') {
        const dur =
          p.completedAt !== undefined ? formatDuration(p.completedAt - p.startedAt) : undefined;
        return {
          kind: 'thinking',
          id: p.id,
          text: p.text,
          duration: dur,
          isActive: p.completedAt === undefined,
        };
      }
      // tool part
      const dur =
        p.completedAt !== undefined ? formatDuration(p.completedAt - p.startedAt) : undefined;
      return {
        kind: 'tool',
        id: p.id,
        toolCall: {
          id: p.id,
          type: inferToolType(p.name),
          name: p.name,
          input: p.args ? JSON.stringify(p.args) : undefined,
          output: p.result,
          status: p.status,
          duration: dur,
        },
        duration: dur,
        isActive: p.completedAt === undefined,
      };
    }
  );

  return {
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content,
    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    thinking,
    toolCalls: msg.toolCalls?.map((tc) => adaptToolCall(tc)),
    parts,
    isStreaming: msg.isStreaming,
    images: msg.images?.map((img) => (typeof img === 'string' ? img : img.url ?? '')),
    audioUrl: msg.audioUrl,
    videoUrl: msg.videoUrl,
    files: msg.files,
    fileAttachments: msg.attachedFiles,
    kind: msg.kind,
    internalEvent: msg.internalEvent,
    interrupted: msg.interrupted,
    retryFromMessageId: msg.retryFromMessageId,
    guessedMedia: msg.guessedMedia,
    interactive: msg.interactive,
    approvals: msg.approvals,
  };
}

export function adaptSessions(sessions: Session[], pinnedKeys: Set<string>, untitled: string): MockSession[] {
  return sessions.map((s) => ({
    id: s.key,
    title: s.title || untitled,
    preview: s.lastMessage?.slice(0, 120) ?? '',
    updatedAt: s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now(),
    isPinned: pinnedKeys.has(s.key),
  }));
}

export function modelsToSections(models: Model[]): PickerSection[] {
  const groups = groupModelsByProvider(models);
  return groups.map((group) => ({
    title: group.label,
    items: group.items.map((m) => {
      const displayName = m.name ?? m.id;
      return {
        key: m.id,
        title: displayName,
        dot: group.color,
        providerSlug: group.slug,
        subtitle: displayName !== m.id ? m.id : undefined,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow,
        supportsImages: m.input?.includes('image'),
      };
    }),
  }));
}

export function agentsToPickerItems(agents: Agent[]): DynamicPickerItem[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    dotBg: '#F59E0B',
    emoji: a.emoji,
  }));
}
