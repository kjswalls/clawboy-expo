export const MOCK_MODELS = [
  { id: 'claude-4', name: 'Claude 4', dotBg: '#10B981' },
  { id: 'claude-3.5', name: 'Claude 3.5 Sonnet', dotBg: '#F97316' },
  { id: 'gpt-5', name: 'GPT-5', dotBg: '#22C55E' },
  { id: 'gemini-2', name: 'Gemini 2 Pro', dotBg: '#3B82F6' },
] as const;

export const MOCK_AGENTS = [
  { id: 'clawboy', name: 'ClawBoy Agent', emoji: '🐾', dotBg: '#F59E0B' },
  { id: 'coder', name: 'Code Assistant', emoji: '💻', dotBg: '#A855F7' },
  { id: 'researcher', name: 'Deep Research', emoji: '🔬', dotBg: '#06B6D4' },
  { id: 'writer', name: 'Writing Helper', emoji: '✍️', dotBg: '#22C55E' },
] as const;
