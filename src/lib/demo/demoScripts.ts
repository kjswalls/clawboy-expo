/**
 * Scripted reply engine for the offline demo profile.
 *
 * `runDemoScript` emits the same events that OpenClawClient emits so
 * `useChat` receives them without modification.
 *
 * Timing is deterministic when `process.env.JEST_WORKER_ID` is set so tests
 * don't have to wait for real delays.
 */

import { generateUUID } from '@/lib/openclaw/utils';

const IS_TEST = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;

const delay = (ms: number): Promise<void> =>
  IS_TEST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Reply scripts — keyword-keyed
// ---------------------------------------------------------------------------

interface ScriptEvent {
  kind: 'thinking' | 'tool_start' | 'tool_result' | 'text' | 'final';
  text?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  delayMs?: number;
}

type ScriptDef = {
  thinking: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  reply: string;
};

const SCRIPTS: Array<{ pattern: RegExp; def: ScriptDef }> = [
  {
    pattern: /\bjoke\b|\bfunny\b|\bhumou?r\b/i,
    def: {
      thinking: "The user wants something funny. I'll craft a short, clean programming joke.",
      reply: `Why do programmers prefer dark mode?\n\nBecause light attracts bugs! 🐛\n\n*(Ba dum tss)*\n\nWant another? Just ask.`,
    },
  },
  {
    pattern: /\bcode\b|\bfunction\b|\bhook\b|\bcomponent\b|\bapi\b|\btype\b|\binterface\b/i,
    def: {
      thinking: 'The user wants code assistance. I\'ll write a clean TypeScript example.',
      toolName: 'code_execution',
      toolArgs: { action: 'generate', language: 'typescript' },
      toolResult: 'Code generated successfully.',
      reply: `Here's a TypeScript example to get you started:\n\n\`\`\`typescript\nfunction debounce<T extends (...args: unknown[]) => void>(\n  fn: T,\n  delayMs: number,\n): (...args: Parameters<T>) => void {\n  let timer: ReturnType<typeof setTimeout> | null = null;\n  return (...args: Parameters<T>): void => {\n    if (timer) clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), delayMs);\n  };\n}\n\n// Usage\nconst debouncedSearch = debounce((query: string) => {\n  console.log('Searching for:', query);\n}, 300);\n\`\`\`\n\nThis is a type-safe \`debounce\` utility that works with any function signature. Want me to extend it or build something more specific?`,
    },
  },
  {
    pattern: /\bimage\b|\bpicture\b|\bphoto\b|\bsunset\b|\bdraw\b|\bgenerate.*image\b/i,
    def: {
      thinking: 'The user wants an image. In demo mode I\'ll serve the bundled sunset asset.',
      toolName: 'image_search',
      toolArgs: { query: 'beautiful landscape', style: 'photography' },
      toolResult: 'Image found: coastal sunset, golden hour.',
      reply: 'Here\'s a stunning landscape from the demo asset library. In a live session your gateway can generate or retrieve real images on demand.',
    },
  },
  {
    pattern: /\bhelp\b|\bwhat can you\b|\bwhat are you\b|\bcapabilit/i,
    def: {
      thinking: "The user wants to know what I can do. I'll give a concise capability overview.",
      reply: `I can help with:\n\n- **Code** — write, debug, explain, refactor in any language\n- **Research** — web search, document analysis, fact-checking\n- **Automation** — file management, shell scripts, API calls\n- **Creative** — writing, brainstorming, image generation\n- **Data** — parse, transform, visualize datasets\n\nThis is the **demo mode** — responses are scripted. Connect a real OpenClaw gateway in Settings to unlock live AI.\n\nType anything — I'll do my best!`,
    },
  },
  {
    pattern: /\bsettings\b|\bgateway\b|\bconnect\b|\bserver\b/i,
    def: {
      thinking: 'The user is asking about connecting to a real server.',
      reply: `To connect your own OpenClaw gateway:\n\n1. Tap the **⚙️ Settings** icon at the top right\n2. Tap **Exit demo & add server**\n3. Enter your gateway URL and auth token\n4. ClawBoy will pair with your gateway using a secure Ed25519 device key\n\nYour gateway can be running locally (Tailscale), on a VPS, or any machine you control.`,
    },
  },
];

const FALLBACK_DEF: ScriptDef = {
  thinking: "I'll give a helpful demo response that shows off the thinking-and-reply pattern.",
  toolName: 'context_lookup',
  toolArgs: { query: 'user_request' },
  toolResult: 'Context retrieved successfully.',
  reply: `That's an interesting question! In demo mode my responses are scripted, so I can't answer every query with live reasoning.\n\nHere are a few prompts I respond well to in demo mode:\n- *"Tell me a joke"*\n- *"Write me a TypeScript function"*\n- *"Show me a sunset photo"*\n- *"What can you help me with?"*\n\nConnect a real OpenClaw gateway in Settings to get fully live AI responses.`,
};

function selectScript(text: string): ScriptDef {
  for (const { pattern, def } of SCRIPTS) {
    if (pattern.test(text)) return def;
  }
  return FALLBACK_DEF;
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
): Promise<{ finalMessageId: string; includeImage?: boolean }> {
  const def = selectScript(text);
  const messageId = generateUUID();
  const sk = sessionKey;

  const check = (): boolean => !abortSignal.aborted;

  // 1 — signal that a response is coming
  emit('chatAwaitingResponse', { sessionKey: sk });
  await delay(IS_TEST ? 0 : 80);
  if (!check()) return { finalMessageId: messageId };

  // 2 — thinking phase
  emit('streamStart', { sessionKey: sk });
  const thinkingWords = def.thinking.split(' ');
  let thinkingAcc = '';
  for (const word of thinkingWords) {
    if (!check()) return { finalMessageId: messageId };
    thinkingAcc += (thinkingAcc ? ' ' : '') + word;
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
  emit('streamEnd', { sessionKey: sk });

  // 6 — final message (chat:final equivalent)
  const includeImage =
    def.toolName === 'image_search' || /\bimage\b|\bpicture\b|\bphoto\b|\bsunset\b/i.test(text);

  const finalMsg = {
    id: messageId,
    role: 'assistant',
    content: def.reply,
    timestamp: new Date().toISOString(),
    thinking: def.thinking + ' ' + thinkingAcc,
    sessionKey: sk,
    images: includeImage
      ? [{ url: '__demo_asset_sunset__', mimeType: 'image/jpeg', alt: 'Demo image' }]
      : undefined,
  };

  emit('message', finalMsg);

  return { finalMessageId: messageId, includeImage };
}
