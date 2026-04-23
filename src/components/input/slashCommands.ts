import type { LucideIcon } from 'lucide-react-native';
import { Activity, Bot, Code, Cpu, FileText, Globe, Image, Mic, Plus, RotateCcw, Search, Zap } from 'lucide-react-native';

export interface SlashCommandItem {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** When true, this command is handled locally in the app rather than sent to the gateway. */
  isLocal?: boolean;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  { id: 'new', name: 'new', description: 'Start a new session', icon: Plus, isLocal: true },
  { id: 'reset', name: 'reset', description: 'Reset current session', icon: RotateCcw, isLocal: true },
  { id: 'status', name: 'status', description: 'Show connection status', icon: Activity, isLocal: true },
  { id: 'model', name: 'model', description: 'Switch model (e.g. /model claude-3)', icon: Cpu, isLocal: true },
  { id: 'agent', name: 'agent', description: 'Switch agent (e.g. /agent main)', icon: Bot, isLocal: true },
  { id: 'image', name: 'image', description: 'Generate an image', icon: Image },
  { id: 'search', name: 'search', description: 'Search the web', icon: Search },
  { id: 'read', name: 'read', description: 'Read a file or URL', icon: FileText },
  { id: 'code', name: 'code', description: 'Execute code', icon: Code },
  { id: 'switch-agent', name: 'switch', description: 'Switch agent mode', icon: Zap },
  { id: 'browse', name: 'browse', description: 'Browse a website', icon: Globe },
  { id: 'voice', name: 'voice', description: 'Voice input', icon: Mic },
];
