import type { MockSession } from '@/types';

export const mockSessions: MockSession[] = [
  {
    id: 'sess-1',
    title: 'Project planning',
    preview: 'Let me outline the milestones and risks for the release.',
    updatedAt: Date.now() - 2 * 60 * 1000,
    isPinned: true,
  },
  {
    id: 'sess-2',
    title: 'Gateway debugging',
    preview: 'Checking WebSocket frames and auth challenge flow.',
    updatedAt: Date.now() - 45 * 60 * 1000,
    isPinned: true,
  },
  {
    id: 'sess-3',
    title: 'Design tokens',
    preview: 'Mapping v0 Tailwind colors to StyleSheet tokens.',
    updatedAt: Date.now() - 3 * 60 * 60 * 1000,
    isPinned: false,
  },
  {
    id: 'sess-4',
    title: 'Random ideas',
    preview: '',
    updatedAt: Date.now() - 26 * 60 * 60 * 1000,
    isPinned: false,
  },
];
