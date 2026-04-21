import type { LucideIcon } from 'lucide-react-native';
import { Code, FileText, Globe, Image, Mic, Search, Zap } from 'lucide-react-native';

export interface SlashCommandItem {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  { id: 'image', name: 'image', description: 'Generate an image', icon: Image },
  { id: 'search', name: 'search', description: 'Search the web', icon: Search },
  { id: 'read', name: 'read', description: 'Read a file or URL', icon: FileText },
  { id: 'code', name: 'code', description: 'Execute code', icon: Code },
  { id: 'agent', name: 'agent', description: 'Switch agent mode', icon: Zap },
  { id: 'browse', name: 'browse', description: 'Browse a website', icon: Globe },
  { id: 'voice', name: 'voice', description: 'Voice input', icon: Mic },
];
