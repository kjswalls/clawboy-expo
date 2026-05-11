/**
 * Static seeded data for the offline demo profile.
 * Sessions, agents, models, and commands are all hardcoded here — no network
 * call or gateway connection is needed.
 *
 * All user-visible strings are resolved via i18n at call-time so the correct
 * locale is returned regardless of when the module was first imported.
 */

import type { Session, Agent } from '@/lib/openclaw/types';
import type { Model } from '@/types';
import type { CommandEntry } from '@/lib/openclaw/commands';
import { generateUUID } from '@/lib/openclaw/utils';
import i18n from '@/i18n';

// ---------------------------------------------------------------------------
// Demo session keys — stable, never change between installs
// ---------------------------------------------------------------------------

export const DEMO_SESSION_WELCOME = 'demo:welcome';
export const DEMO_SESSION_CODEGEN = 'demo:codegen';
export const DEMO_SESSION_MEDIA = 'demo:media';

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function makeSession(key: string, title: string, lastMessage: string, minsAgo: number): Session {
  const now = Date.now();
  const updatedAt = new Date(now - minsAgo * 60 * 1000).toISOString();
  return {
    id: key,
    key,
    title,
    agentId: 'demo-general',
    createdAt: updatedAt,
    updatedAt,
    lastMessage,
  };
}

/**
 * Returns fresh seeded demo sessions with timestamps relative to now.
 * Called on each `listSessions()` so the "2 mins ago" previews don't freeze
 * at the timestamp of the first import.
 */
export function makeDemoSessions(): Session[] {
  const t = (key: string): string => i18n.t(key);
  return [
    makeSession(
      DEMO_SESSION_WELCOME,
      t('demo.sessions.welcome.title'),
      t('demo.sessions.welcome.lastMessage'),
      2,
    ),
    makeSession(
      DEMO_SESSION_CODEGEN,
      t('demo.sessions.codegen.title'),
      t('demo.sessions.codegen.lastMessage'),
      45,
    ),
    makeSession(
      DEMO_SESSION_MEDIA,
      t('demo.sessions.media.title'),
      t('demo.sessions.media.lastMessage'),
      180,
    ),
  ];
}


// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export function getDemoAgents(): Agent[] {
  const t = (key: string): string => i18n.t(key);
  return [
    {
      id: 'demo-general',
      name: t('demo.agents.general.name'),
      description: t('demo.agents.general.description'),
      status: 'online',
      emoji: '🤖',
    },
    {
      id: 'demo-code',
      name: t('demo.agents.code.name'),
      description: t('demo.agents.code.description'),
      status: 'online',
      emoji: '💻',
    },
  ];
}


// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function getDemoModels(): Model[] {
  const t = (key: string): string => i18n.t(key);
  return [
    {
      id: 'demo-reasoning',
      name: t('demo.models.reasoning.name'),
      provider: 'Demo',
      contextWindow: 128000,
      reasoning: true,
      input: ['text', 'image'],
    },
    {
      id: 'demo-fast',
      name: t('demo.models.fast.name'),
      provider: 'Demo',
      contextWindow: 32000,
      reasoning: false,
      input: ['text'],
    },
  ];
}


// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function getDemoCommands(): CommandEntry[] {
  const t = (key: string): string => i18n.t(key);
  return [
    {
      key: 'help',
      name: 'help',
      description: t('demo.commands.help.description'),
      textAliases: ['/help'],
      category: 'tools',
      tier: 'essential',
    } as CommandEntry,
    {
      key: 'new',
      name: 'new',
      description: t('demo.commands.new.description'),
      textAliases: ['/new'],
      category: 'session',
      tier: 'essential',
    } as CommandEntry,
    {
      key: 'reset',
      name: 'reset',
      description: t('demo.commands.reset.description'),
      textAliases: ['/reset'],
      category: 'session',
      tier: 'essential',
    } as CommandEntry,
  ];
}


// ---------------------------------------------------------------------------
// Pre-seeded history for the welcome session
// ---------------------------------------------------------------------------

export interface DemoHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thinking?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    status: 'completed' | 'running' | 'error';
    args?: Record<string, unknown>;
    result?: string;
  }>;
  images?: Array<{ url: string; mimeType?: string; alt?: string }>;
  audioUrl?: string;
}

const ts = (minsAgo: number): string =>
  new Date(Date.now() - minsAgo * 60 * 1000).toISOString();

export function getWelcomeHistory(): DemoHistoryMessage[] {
  const t = (key: string): string => i18n.t(key);
  return [
    {
      id: 'w-1',
      role: 'user',
      content: t('demo.history.welcome.user1.content'),
      timestamp: ts(3),
    },
    {
      id: 'w-2',
      role: 'assistant',
      content: t('demo.history.welcome.assistant1.content'),
      timestamp: ts(2),
      thinking: t('demo.history.welcome.assistant1.thinking'),
      toolCalls: [
        {
          id: 'w-tc-1',
          name: 'get_agent_capabilities',
          status: 'completed',
          args: { agentId: 'demo-general' },
          result: 'Capabilities: code_execution, web_search, file_management, image_generation',
        },
      ],
    },
  ];
}

export function getCodegenHistory(): DemoHistoryMessage[] {
  const t = (key: string): string => i18n.t(key);
  return [
    {
      id: 'c-1',
      role: 'user',
      content: t('demo.history.codegen.user1.content'),
      timestamp: ts(10),
    },
    {
      id: 'c-2',
      role: 'assistant',
      content: '',
      timestamp: ts(9),
      thinking: t('demo.history.codegen.assistant1Thinking'),
      toolCalls: [
        {
          id: 'c-tc-1',
          name: 'web_search',
          status: 'completed',
          args: { query: 'react custom hook form validation best practices' },
          result: 'Found 5 relevant articles on React form validation patterns.',
        },
      ],
    },
    {
      id: 'c-3',
      role: 'assistant',
      content: t('demo.history.codegen.assistant2Content'),
      timestamp: ts(8),
    },
    {
      id: 'c-4',
      role: 'user',
      content: t('demo.history.codegen.user2.content'),
      timestamp: ts(5),
    },
    {
      id: 'c-5',
      role: 'assistant',
      content: '',
      timestamp: ts(4),
      thinking: t('demo.history.codegen.assistant3Thinking'),
      toolCalls: [
        {
          id: 'c-tc-2',
          name: 'code_execution',
          status: 'completed',
          args: { action: 'generate', target: 'SignupForm.tsx' },
          result: 'Component generated successfully with email and password validation.',
        },
      ],
    },
    {
      id: 'c-6',
      role: 'assistant',
      content: t('demo.history.codegen.assistant4Content'),
      timestamp: ts(3),
    },
  ];
}

export function getMediaHistory(): DemoHistoryMessage[] {
  const t = (key: string): string => i18n.t(key);
  return [
    {
      id: 'm-1',
      role: 'user',
      content: t('demo.history.media.user1.content'),
      timestamp: ts(4),
    },
    {
      id: 'm-2',
      role: 'assistant',
      content: '',
      timestamp: ts(3),
      thinking: t('demo.history.media.assistant1Thinking'),
      toolCalls: [
        {
          id: 'm-tc-1',
          name: 'image_search',
          status: 'completed',
          args: { query: 'beautiful sunset coastal', style: 'photography' },
          result: 'Found: Malibu coast sunset, golden hour.',
        },
      ],
    },
    {
      id: 'm-3',
      role: 'assistant',
      content: t('demo.history.media.assistant2Content'),
      timestamp: ts(2),
      // Image URL is overridden in DemoOpenClawClient.getSessionMessages() with a local asset URI
      images: [{ url: '__demo_asset_sunset__', mimeType: 'image/jpeg', alt: t('demo.history.media.imageAlt') }],
    },
  ];
}


// ---------------------------------------------------------------------------
// UUID helper for new sessions
// ---------------------------------------------------------------------------

export function demoSessionKey(): string {
  return `demo:user:${generateUUID()}`;
}
