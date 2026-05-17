import type { ChatUiToolCall } from '@/types/chat-ui';

export type ToolRun =
  | { kind: 'group'; tools: ChatUiToolCall[] }
  | { kind: 'single'; tool: ChatUiToolCall };

export function groupToolCalls(toolCalls: ChatUiToolCall[], threshold = 3): ToolRun[] {
  if (toolCalls.length >= threshold) {
    return [{ kind: 'group', tools: toolCalls }];
  }
  return toolCalls.map(tool => ({ kind: 'single', tool }));
}
