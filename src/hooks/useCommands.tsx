import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/contexts/ConnectionContext';
import {
  BUILTIN_COMMAND_NAMES,
  BUILTIN_SLASH_COMMANDS,
  type SlashCommandItem,
} from '@/components/input/slashCommands';
import type { CommandEntry } from '@/lib/openclaw/commands';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  ChevronRight,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FastForward,
  Folder,
  HelpCircle,
  Loader,
  Monitor,
  Mic,
  Plus,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  Volume2,
  X,
  Zap,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

type SlashCommandCategory = SlashCommandItem['category'];
type SlashCommandTier = SlashCommandItem['tier'];

const CATEGORY_ORDER: SlashCommandCategory[] = ['session', 'model', 'tools', 'agents'];
const TIER_ORDER: Record<SlashCommandTier, number> = { essential: 0, standard: 1, power: 2 };

const ICON_MAP: Record<string, LucideIcon> = {
  help: HelpCircle,
  status: Activity,
  usage: Activity,
  export: Download,
  export_session: Download,
  tools: Terminal,
  skill: Zap,
  commands: BookOpen,
  new: Plus,
  reset: RotateCcw,
  compact: Loader,
  stop: Square,
  clear: Trash2,
  focus: Eye,
  unfocus: EyeOff,
  model: Brain,
  models: Brain,
  think: Brain,
  verbose: Terminal,
  fast: FastForward,
  agents: Monitor,
  agent: Bot,
  subagents: Folder,
  kill: X,
  steer: ChevronRight,
  redirect: ArrowRight,
  tts: Volume2,
  mic: Mic,
  cpu: Cpu,
};

function iconForKey(key: string): LucideIcon {
  return ICON_MAP[key] ?? Terminal;
}

function normalizeKey(raw: string): string {
  return raw.replace(/[:.-]/gu, '_');
}

const CATEGORY_MAP: Partial<Record<string, SlashCommandCategory>> = {
  help: 'tools',
  commands: 'tools',
  tools: 'tools',
  skill: 'tools',
  status: 'tools',
  export_session: 'tools',
  usage: 'tools',
  tts: 'tools',
  agents: 'agents',
  agent: 'agents',
  subagents: 'agents',
  kill: 'agents',
  steer: 'agents',
  redirect: 'agents',
  session: 'session',
  stop: 'session',
  reset: 'session',
  new: 'session',
  compact: 'session',
  focus: 'session',
  unfocus: 'session',
  clear: 'session',
  model: 'model',
  models: 'model',
  think: 'model',
  verbose: 'model',
  fast: 'model',
  reasoning: 'model',
};

function categoryForKey(key: string, rawCategory?: string): SlashCommandCategory {
  const override = CATEGORY_MAP[normalizeKey(key)];
  if (override) return override;
  switch (rawCategory) {
    case 'session': return 'session';
    case 'options': return 'model';
    case 'management': return 'tools';
    default: return 'tools';
  }
}

function formatArgs(entry: CommandEntry): string | undefined {
  if (!entry.args?.length) return undefined;
  return entry.args
    .map((a) => {
      const token = `<${a.name}>`;
      return a.required ? token : `[${a.name}]`;
    })
    .join(' ');
}

function entryToSlashCommand(entry: CommandEntry): SlashCommandItem | null {
  const aliases = (entry.textAliases ?? [])
    .map((a) => a.replace(/^\//u, '').trim())
    .filter(Boolean);
  const primaryName = aliases[0] ?? (entry.name ?? entry.key ?? '');
  if (!primaryName) return null;

  const key = normalizeKey(primaryName);
  if (BUILTIN_COMMAND_NAMES.has(primaryName)) return null;

  const firstArg = entry.args?.[0];
  const argOptions = firstArg?.choices
    ?.map((c) => (typeof c === 'string' ? c : c.value))
    .filter((v): v is string => Boolean(v));

  return {
    id: `remote:${primaryName}`,
    name: primaryName,
    aliases: aliases.slice(1).map((a) => `/${a}`),
    description: entry.description ?? primaryName,
    args: formatArgs(entry),
    argOptions: argOptions?.length ? argOptions : undefined,
    icon: iconForKey(key),
    category: categoryForKey(primaryName, entry.category),
    tier: 'standard',
    isRemote: true,
  };
}

function mergeAndSortCommands(remote: CommandEntry[]): SlashCommandItem[] {
  const remoteItems = remote
    .map(entryToSlashCommand)
    .filter((c): c is SlashCommandItem => c !== null);

  const merged = new Map<string, SlashCommandItem>();
  for (const cmd of [...BUILTIN_SLASH_COMMANDS, ...remoteItems]) {
    const key = cmd.name.toLowerCase();
    if (!merged.has(key)) merged.set(key, cmd);
  }

  return [...merged.values()].sort((a, b) => {
    const aTier = TIER_ORDER[a.tier] ?? 1;
    const bTier = TIER_ORDER[b.tier] ?? 1;
    if (aTier !== bTier) return aTier - bTier;
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

export interface UseCommandsResult {
  commands: SlashCommandItem[];
  loading: boolean;
  refresh: () => void;
}

/**
 * Fetches the merged slash-command list (built-ins + agent-specific remote commands).
 * Automatically refreshes when connected or when agentId changes.
 * Falls back to built-ins when disconnected or if the RPC fails.
 */
export function useCommands(agentId?: string | null): UseCommandsResult {
  const { client: clientRef, connectionState } = useConnection();
  const [commands, setCommands] = useState<SlashCommandItem[]>(BUILTIN_SLASH_COMMANDS);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  const fetchCommands = useCallback(async () => {
    const client = clientRef.current;
    if (!client || connectionState.status !== 'connected') {
      setCommands(BUILTIN_SLASH_COMMANDS);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const entries = await client.listCommands({ agentId, scope: 'text', includeArgs: true });
      if (seq !== seqRef.current) return;
      setCommands(mergeAndSortCommands(entries));
    } catch {
      if (seq !== seqRef.current) return;
      setCommands(BUILTIN_SLASH_COMMANDS);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [clientRef, connectionState.status, agentId]);

  useEffect(() => {
    void fetchCommands();
  }, [fetchCommands]);

  const refresh = useCallback(() => {
    void fetchCommands();
  }, [fetchCommands]);

  return { commands, loading, refresh };
}
