/**
 * Scripted reply engine for the offline demo profile.
 *
 * `runDemoScript` emits the same events that OpenClawClient emits so
 * `useChat` receives them without modification.
 *
 * Timing is deterministic when `process.env.JEST_WORKER_ID` is set so tests
 * don't have to wait for real delays.
 *
 * All user-visible strings are resolved via i18n at call-time so the correct
 * locale is used regardless of when the module was first imported.
 */

import { generateUUID } from '@/lib/openclaw/utils';
import i18n from '@/i18n';

const IS_TEST = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;

const delay = (ms: number): Promise<void> =>
  IS_TEST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Reply scripts — keyword-keyed
// ---------------------------------------------------------------------------

type ScriptDef = {
  thinking: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  reply: string;
};

type ScriptEntry = { pattern: RegExp; key: string; toolName?: string; toolArgs?: Record<string, unknown> };

// Pattern table — keys reference demo.scripts.* in i18n
const SCRIPT_PATTERNS: ScriptEntry[] = [
  {
    pattern: /\bjoke\b|\bfunny\b|\bhumou?r\b/i,
    key: 'joke',
  },
  {
    pattern: /\bcode\b|\bfunction\b|\bhook\b|\bcomponent\b|\bapi\b|\btype\b|\binterface\b/i,
    key: 'code',
    toolName: 'code_execution',
    toolArgs: { action: 'generate', language: 'typescript' },
  },
  {
    pattern: /\bimage\b|\bpicture\b|\bphoto\b|\bsunset\b|\bdraw\b|\bgenerate.*image\b/i,
    key: 'image',
    toolName: 'image_search',
    toolArgs: { query: 'beautiful landscape', style: 'photography' },
  },
  {
    pattern: /\bsummari[sz]e\b|\bsummary\b|\btl;?dr\b/i,
    key: 'summary',
    toolName: 'document_read',
    toolArgs: { source: 'demo_document.md', length: 1247 },
  },
  {
    pattern: /\bbrainstorm\b|\bideas?\b/i,
    key: 'brainstorm',
  },
  {
    pattern: /\bhelp\b|\bwhat can you\b|\bwhat are you\b|\bcapabilit/i,
    key: 'help',
  },
  {
    pattern: /\bsettings\b|\bgateway\b|\bconnect\b|\bserver\b/i,
    key: 'settings',
  },
];

function t(key: string): string {
  return i18n.t(key);
}

function buildScriptDef(entry: ScriptEntry): ScriptDef {
  const base = `demo.scripts.${entry.key}`;
  const def: ScriptDef = {
    thinking: t(`${base}.thinking`),
    reply: t(`${base}.reply`),
  };
  if (entry.toolName) {
    def.toolName = entry.toolName;
    def.toolArgs = entry.toolArgs;
    def.toolResult = t(`${base}.toolResult`);
  }
  return def;
}

function getFallbackDef(): ScriptDef {
  return {
    thinking: t('demo.scripts.fallback.thinking'),
    toolName: 'context_lookup',
    toolArgs: { query: 'user_request' },
    toolResult: t('demo.scripts.fallback.toolResult'),
    reply: t('demo.scripts.fallback.reply'),
  };
}

function selectScript(text: string): ScriptDef {
  for (const entry of SCRIPT_PATTERNS) {
    if (entry.pattern.test(text)) return buildScriptDef(entry);
  }
  return getFallbackDef();
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Returns the scripted reply text for a given user message (deterministic). */
export function getDemoScriptReply(text: string): string {
  return selectScript(text).reply;
}

// ---------------------------------------------------------------------------
// Event emitter type (matches what DemoOpenClawClient provides)
// ---------------------------------------------------------------------------

export type DemoEmitter = (event: string, payload: unknown) => void;

// ---------------------------------------------------------------------------
// Main script runner
// ---------------------------------------------------------------------------

export async function runDemoScript(
  text: string,
  sessionKey: string,
  emit: DemoEmitter,
  abortSignal: { aborted: boolean },
  streamId?: string,
): Promise<{ finalMessageId: string; includeImage?: boolean }> {
  const def = selectScript(text);
  const messageId = generateUUID();
  const sk = sessionKey;
  const sid = streamId ?? generateUUID();

  const check = (): boolean => !abortSignal.aborted;

  // 1 — signal that a response is coming
  emit('chatAwaitingResponse', { sessionKey: sk, streamId: sid });
  await delay(IS_TEST ? 0 : 80);
  if (!check()) return { finalMessageId: messageId };

  // 2 — thinking phase
  emit('streamStart', { sessionKey: sk, streamId: sid });
  const thinkingWords = def.thinking.split(' ');
  for (const word of thinkingWords) {
    if (!check()) return { finalMessageId: messageId };
    emit('thinkingChunk', { text: word + ' ', sessionKey: sk });
    await delay(IS_TEST ? 0 : 25 + Math.random() * 30);
  }
  await delay(IS_TEST ? 0 : 120);
  if (!check()) return { finalMessageId: messageId };

  // 3 — optional tool call
  if (def.toolName) {
    const toolCallId = `demo-tc-${generateUUID()}`;
    emit('toolCall', {
      toolCallId,
      name: def.toolName,
      phase: 'start',
      args: def.toolArgs ?? {},
      sessionKey: sk,
    });
    await delay(IS_TEST ? 0 : 600);
    if (!check()) return { finalMessageId: messageId };

    emit('toolCall', {
      toolCallId,
      name: def.toolName,
      phase: 'result',
      result: def.toolResult ?? 'Done.',
      sessionKey: sk,
    });
    await delay(IS_TEST ? 0 : 150);
    if (!check()) return { finalMessageId: messageId };
  }

  // 4 — text streaming
  const words = def.reply.split(' ');
  for (const word of words) {
    if (!check()) return { finalMessageId: messageId };
    emit('streamChunk', { text: word + ' ', sessionKey: sk });
    await delay(IS_TEST ? 0 : 18 + Math.random() * 25);
  }
  await delay(IS_TEST ? 0 : 60);
  if (!check()) return { finalMessageId: messageId };

  // 5 — streamEnd
  emit('streamEnd', { sessionKey: sk, streamId: sid });

  // 6 — final message (chat:final equivalent)
  const includeImage =
    def.toolName === 'image_search' || /\bimage\b|\bpicture\b|\bphoto\b|\bsunset\b/i.test(text);

  const finalMsg = {
    id: messageId,
    role: 'assistant',
    content: def.reply,
    timestamp: new Date().toISOString(),
    thinking: def.thinking,
    sessionKey: sk,
    images: includeImage
      ? [{ url: '__demo_asset_sunset__', mimeType: 'image/jpeg', alt: t('demo.defaults.imageAlt') }]
      : undefined,
  };

  emit('message', finalMsg);

  return { finalMessageId: messageId, includeImage };
}
