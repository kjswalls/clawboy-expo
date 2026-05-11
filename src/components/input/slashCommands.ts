import type { LucideIcon } from 'lucide-react-native';
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

export type SlashCommandCategory = 'session' | 'model' | 'agents' | 'tools';
export type SlashCommandTier = 'essential' | 'standard' | 'power';

export interface SlashCommandItem {
  id: string;
  name: string;
  aliases?: string[];
  description: string;
  args?: string;
  /**
   * Fixed option choices for this command (e.g. `["on","off"]` for `/verbose`).
   * When present, the palette enters an args-picker mode after the command is selected.
   */
  argOptions?: string[];
  icon: LucideIcon;
  category: SlashCommandCategory;
  tier: SlashCommandTier;
  /**
   * When true, this command is executed client-side rather than sent to the gateway.
   * Commands without executeLocal are forwarded to the gateway as-is.
   */
  executeLocal?: boolean;
  /** For remote/dynamic commands fetched from the server. */
  isRemote?: boolean;
}

const CATEGORY_ORDER: SlashCommandCategory[] = ['session', 'model', 'tools', 'agents'];

const TIER_ORDER: Record<SlashCommandTier, number> = {
  essential: 0,
  standard: 1,
  power: 2,
};

/**
 * Canonical OpenClaw built-in slash commands.
 * Mirrors the command registry in OpenClaw's UI (ui/src/ui/chat/slash-commands.ts).
 */
export const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  // ── Session ──────────────────────────────────────────────────────────────
  {
    id: 'new',
    name: 'new',
    description: 'Start a new session',
    icon: Plus,
    category: 'session',
    tier: 'essential',
    executeLocal: true,
  },
  {
    id: 'reset',
    name: 'reset',
    description: 'Reset the current session',
    icon: RotateCcw,
    category: 'session',
    tier: 'essential',
    executeLocal: true,
  },
  {
    id: 'clear',
    name: 'clear',
    description: 'Clear chat history (local display only)',
    icon: Trash2,
    category: 'session',
    tier: 'standard',
    executeLocal: true,
  },
  {
    id: 'stop',
    name: 'stop',
    description: 'Stop the active response',
    icon: Square,
    category: 'session',
    tier: 'essential',
    executeLocal: true,
  },
  {
    id: 'compact',
    name: 'compact',
    description: 'Compact/summarise the session context',
    icon: Loader,
    category: 'session',
    tier: 'standard',
  },
  {
    id: 'focus',
    name: 'focus',
    description: 'Focus the agent on a specific task',
    icon: Eye,
    category: 'session',
    tier: 'power',
  },
  {
    id: 'unfocus',
    name: 'unfocus',
    description: 'Remove focus constraints from the agent',
    icon: EyeOff,
    category: 'session',
    tier: 'power',
  },

  // ── Model ─────────────────────────────────────────────────────────────────
  {
    id: 'model',
    name: 'model',
    description: 'Switch model (e.g. /model claude-3)',
    args: '<id>',
    icon: Brain,
    category: 'model',
    tier: 'essential',
    executeLocal: true,
  },
  {
    id: 'think',
    name: 'think',
    description: 'Toggle extended thinking / reasoning',
    icon: Brain,
    category: 'model',
    tier: 'standard',
  },
  {
    id: 'fast',
    name: 'fast',
    description: 'Switch to a fast/lightweight model',
    argOptions: ['status', 'on', 'off'],
    icon: FastForward,
    category: 'model',
    tier: 'standard',
  },
  {
    id: 'verbose',
    name: 'verbose',
    description: 'Enable verbose output (tool call details, etc.)',
    argOptions: ['on', 'off'],
    icon: Terminal,
    category: 'model',
    tier: 'power',
  },

  // ── Tools ─────────────────────────────────────────────────────────────────
  {
    id: 'help',
    name: 'help',
    description: 'Show available commands and usage',
    icon: HelpCircle,
    category: 'tools',
    tier: 'essential',
    executeLocal: true,
  },
  {
    id: 'commands',
    name: 'commands',
    description: 'List all available slash commands',
    icon: BookOpen,
    category: 'tools',
    tier: 'standard',
    executeLocal: true,
  },
  {
    id: 'status',
    name: 'status',
    description: 'Show connection status',
    icon: Activity,
    category: 'tools',
    tier: 'standard',
    executeLocal: true,
  },
  {
    id: 'usage',
    name: 'usage',
    description: 'Show token / context usage',
    icon: Activity,
    category: 'tools',
    tier: 'standard',
    executeLocal: true,
  },
  {
    id: 'export-session',
    name: 'export-session',
    aliases: ['export'],
    description: 'Export the current session as text',
    icon: Download,
    category: 'tools',
    tier: 'standard',
  },
  {
    id: 'tts',
    name: 'tts',
    description: 'Toggle text-to-speech for AI responses',
    argOptions: ['on', 'off', 'inherit'],
    icon: Volume2,
    category: 'tools',
    tier: 'power',
  },
  {
    id: 'skill',
    name: 'skill',
    description: 'Run or manage agent skills',
    args: '<name>',
    icon: Zap,
    category: 'tools',
    tier: 'power',
  },

  // ── Agents ────────────────────────────────────────────────────────────────
  {
    id: 'agents',
    name: 'agents',
    description: 'List all available agents',
    icon: Monitor,
    category: 'agents',
    tier: 'standard',
    executeLocal: true,
  },
  {
    id: 'agent',
    name: 'agent',
    description: 'Switch to an agent (e.g. /agent main)',
    args: '<name>',
    icon: Bot,
    category: 'agents',
    tier: 'essential',
    executeLocal: true,
  },
  {
    id: 'subagents',
    name: 'subagents',
    description: 'List running subagents',
    icon: Folder,
    category: 'agents',
    tier: 'standard',
  },
  {
    id: 'kill',
    name: 'kill',
    description: 'Kill a running subagent',
    args: '[id]',
    icon: X,
    category: 'agents',
    tier: 'power',
  },
  {
    id: 'steer',
    name: 'steer',
    description: 'Inject a message into the active run',
    args: '[id] <message>',
    icon: ChevronRight,
    category: 'agents',
    tier: 'power',
  },
  {
    id: 'redirect',
    name: 'redirect',
    description: 'Abort and restart with a new message',
    args: '[id] <message>',
    icon: ArrowRight,
    category: 'agents',
    tier: 'power',
    executeLocal: true,
  },
];

// Build a Set of reserved built-in names + aliases for fast lookup.
export const BUILTIN_COMMAND_NAMES: Set<string> = new Set(
  BUILTIN_SLASH_COMMANDS.flatMap((cmd) => [
    cmd.name,
    ...(cmd.aliases ?? []).map((a) => a.replace(/^\//u, '')),
  ]),
);

/**
 * Filter commands by query text (name/alias prefix match, or description substring).
 * When query is empty and showPower is false, power-tier commands are hidden.
 */
export function filterCommands(
  commands: SlashCommandItem[],
  query: string,
  options?: { showPower?: boolean },
): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  const showPower = options?.showPower ?? q.length > 0;

  let result = q
    ? commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().startsWith(q) ||
          cmd.aliases?.some((a) => a.replace(/^\//u, '').toLowerCase().startsWith(q)) ||
          cmd.description.toLowerCase().includes(q),
      )
    : commands;

  if (!showPower) {
    result = result.filter((cmd) => cmd.tier !== 'power');
  }

  return [...result].sort((a, b) => {
    const aTier = TIER_ORDER[a.tier] ?? 1;
    const bTier = TIER_ORDER[b.tier] ?? 1;
    if (aTier !== bTier) return aTier - bTier;
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    if (q) {
      const aExact = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bExact = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
    }
    return a.name.localeCompare(b.name);
  });
}

export interface ParsedSlashCommand {
  command: SlashCommandItem;
  args: string;
}

/**
 * Parse a raw text string like "/model claude-3" into { command, args }.
 * Returns null if the text is not a slash command or the name is unrecognised.
 */
export function parseSlashCommand(
  text: string,
  commands: SlashCommandItem[],
): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const body = trimmed.slice(1);
  const sep = body.search(/[\s:]/u);
  const name = sep === -1 ? body : body.slice(0, sep);
  let remainder = sep === -1 ? '' : body.slice(sep).trimStart();
  if (remainder.startsWith(':')) {
    remainder = remainder.slice(1).trimStart();
  }
  const args = remainder.trim();

  if (!name) return null;

  const normalizedName = name.toLowerCase();
  const command = commands.find(
    (cmd) =>
      cmd.name.toLowerCase() === normalizedName ||
      cmd.aliases?.some((alias) => alias.replace(/^\//u, '').toLowerCase() === normalizedName),
  );

  if (!command) return null;
  return { command, args };
}
