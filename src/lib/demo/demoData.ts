/**
 * Static seeded data for the offline demo profile.
 * Sessions, agents, models, and commands are all hardcoded here — no network
 * call or gateway connection is needed.
 */

import type { Session, Agent } from '@/lib/openclaw/types';
import type { Model } from '@/types';
import type { CommandEntry } from '@/lib/openclaw/commands';
import { generateUUID } from '@/lib/openclaw/utils';

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
  return [
    makeSession(DEMO_SESSION_WELCOME, 'Welcome to ClawBoy', "I've set up a quick tour of the interface.", 2),
    makeSession(DEMO_SESSION_CODEGEN, 'TypeScript generics deep dive', "Here's a robust implementation of the useFormValidation hook.", 45),
    makeSession(DEMO_SESSION_MEDIA, 'Show me a sunset', "Here's a beautiful sunset from the Malibu coast.", 180),
  ];
}

/** @deprecated Use makeDemoSessions() for fresh timestamps. Kept for backward compat. */
export const DEMO_SESSIONS: Session[] = makeDemoSessions();

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const DEMO_AGENTS: Agent[] = [
  {
    id: 'demo-general',
    name: 'Demo · General',
    description: 'A general-purpose demo agent.',
    status: 'online',
    emoji: '🤖',
  },
  {
    id: 'demo-code',
    name: 'Demo · Code Helper',
    description: 'Specializes in code generation and review.',
    status: 'online',
    emoji: '💻',
  },
];

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const DEMO_MODELS: Model[] = [
  {
    id: 'demo-reasoning',
    name: 'Demo Reasoning',
    provider: 'Demo',
    contextWindow: 128000,
    reasoning: true,
    input: ['text', 'image'],
  },
  {
    id: 'demo-fast',
    name: 'Demo Fast',
    provider: 'Demo',
    contextWindow: 32000,
    reasoning: false,
    input: ['text'],
  },
];

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const DEMO_COMMANDS: CommandEntry[] = [
  {
    key: 'help',
    name: 'help',
    description: 'Show available commands',
    textAliases: ['/help'],
    category: 'tools',
    tier: 'essential',
  } as CommandEntry,
  {
    key: 'new',
    name: 'new',
    description: 'Create a new session',
    textAliases: ['/new'],
    category: 'session',
    tier: 'essential',
  } as CommandEntry,
  {
    key: 'reset',
    name: 'reset',
    description: 'Reset the current session',
    textAliases: ['/reset'],
    category: 'session',
    tier: 'essential',
  } as CommandEntry,
];

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

const t = (minsAgo: number): string =>
  new Date(Date.now() - minsAgo * 60 * 1000).toISOString();

export const WELCOME_HISTORY: DemoHistoryMessage[] = [
  {
    id: 'w-1',
    role: 'user',
    content: 'What can you help me with?',
    timestamp: t(3),
  },
  {
    id: 'w-2',
    role: 'assistant',
    content: `Welcome to **ClawBoy** — your personal AI gateway client.\n\nI can help you with almost anything:\n\n- **Coding** — write, refactor, debug, and explain code in any language\n- **Research** — search the web, summarize documents, analyze data\n- **Automation** — control your desktop apps, run scripts, manage files\n- **Creative work** — writing, brainstorming, image generation\n\nType anything below to get started, or browse the sample sessions in the sidebar (☰) to see what's possible.`,
    timestamp: t(2),
    thinking: 'The user wants a tour of capabilities. I should give a concise but impressive overview covering the main use cases without overwhelming them.',
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

export const CODEGEN_HISTORY: DemoHistoryMessage[] = [
  {
    id: 'c-1',
    role: 'user',
    content: 'Can you help me understand how to implement a custom hook for form validation in React?',
    timestamp: t(10),
  },
  {
    id: 'c-2',
    role: 'assistant',
    content: '',
    timestamp: t(9),
    thinking: `The user is asking about custom hooks for form validation. I should explain the core concepts and provide a practical example that demonstrates:
1. Managing form state
2. Handling validation rules
3. Tracking touched fields
4. Returning useful values and handlers`,
    toolCalls: [
      {
        id: 'c-tc-1',
        name: 'web_search',
        status: 'completed',
        args: { query: 'react custom hook form validation best practices 2025' },
        result: 'Found 5 relevant articles on React form validation patterns.',
      },
    ],
  },
  {
    id: 'c-3',
    role: 'assistant',
    content: `I'd be happy to help you create a custom form validation hook! Here's a robust implementation:\n\n## Custom useFormValidation Hook\n\n\`\`\`typescript\nimport { useState, useCallback } from 'react';\n\ninterface ValidationRule {\n  required?: boolean;\n  minLength?: number;\n  maxLength?: number;\n  pattern?: RegExp;\n  custom?: (value: string) => string | null;\n}\n\ninterface FormConfig {\n  [field: string]: ValidationRule;\n}\n\nexport function useFormValidation<T extends Record<string, string>>(\n  initialValues: T,\n  validationRules: FormConfig\n) {\n  const [values, setValues] = useState(initialValues);\n  const [errors, setErrors] = useState<Record<string, string>>({});\n  const [touched, setTouched] = useState<Record<string, boolean>>({});\n\n  const validate = useCallback((field: string, value: string) => {\n    const rules = validationRules[field];\n    if (!rules) return null;\n\n    if (rules.required && !value.trim()) {\n      return 'This field is required';\n    }\n    if (rules.minLength && value.length < rules.minLength) {\n      return \`Minimum \${rules.minLength} characters required\`;\n    }\n    return null;\n  }, [validationRules]);\n\n  const handleChange = useCallback((field: string, value: string) => {\n    setValues(prev => ({ ...prev, [field]: value }));\n    const error = validate(field, value);\n    setErrors(prev => ({ ...prev, [field]: error || '' }));\n  }, [validate]);\n\n  return { values, errors, touched, handleChange };\n}\n\`\`\`\n\n### Key Features\n\n- **Type-safe**: Full TypeScript support with generics\n- **Flexible validation**: Support for required, length, pattern, and custom rules\n- **Touch tracking**: Only show errors after user interaction\n- **Performant**: Uses \`useCallback\` to prevent unnecessary re-renders\n\nWould you like me to show you how to use this hook in a form component?`,
    timestamp: t(8),
  },
  {
    id: 'c-4',
    role: 'user',
    content: 'Yes, please show me an example usage!',
    timestamp: t(5),
  },
  {
    id: 'c-5',
    role: 'assistant',
    content: '',
    timestamp: t(4),
    thinking: 'Now I need to create a practical example showing the hook in action. I should create a simple signup form that demonstrates all the validation features.',
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
    content: `Here's a complete example of a signup form using the hook:\n\n\`\`\`tsx\nfunction SignupForm() {\n  const { values, errors, touched, handleChange, handleBlur } = useFormValidation(\n    { email: '', password: '' },\n    {\n      email: { required: true, pattern: /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/ },\n      password: { required: true, minLength: 8 }\n    }\n  );\n\n  return (\n    <form onSubmit={handleSubmit}>\n      <input\n        type="email"\n        value={values.email}\n        onChange={e => handleChange('email', e.target.value)}\n        onBlur={() => handleBlur('email')}\n      />\n      {touched.email && errors.email && (\n        <span className="error">{errors.email}</span>\n      )}\n      \n      <button type="submit">Sign Up</button>\n    </form>\n  );\n}\n\`\`\`\n\nThis gives you real-time validation with a clean, reusable pattern!`,
    timestamp: t(3),
  },
];

export const MEDIA_HISTORY: DemoHistoryMessage[] = [
  {
    id: 'm-1',
    role: 'user',
    content: 'Show me a beautiful sunset photo',
    timestamp: t(4),
  },
  {
    id: 'm-2',
    role: 'assistant',
    content: '',
    timestamp: t(3),
    thinking: "The user wants a sunset image. I'll fetch one from the built-in asset library since we're in demo mode.",
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
    content: "Here's a stunning sunset from the Malibu coast — that warm amber glow at golden hour is something else. The demo asset library has this one built-in so it loads instantly even offline.\n\nIn a real ClawBoy session connected to your gateway, image generation and retrieval tools would pull live results.",
    timestamp: t(2),
    // Image URL is overridden in DemoOpenClawClient.getSessionMessages() with a local asset URI
    images: [{ url: '__demo_asset_sunset__', mimeType: 'image/jpeg', alt: 'Malibu coast sunset' }],
  },
];

// ---------------------------------------------------------------------------
// UUID helper for new sessions
// ---------------------------------------------------------------------------

export function demoSessionKey(): string {
  return `demo:user:${generateUUID()}`;
}
