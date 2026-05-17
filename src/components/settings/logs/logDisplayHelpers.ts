import type { LogLevel, LogLine } from '@/lib/logParser';
import { formatLogDay, logDayKey, type LogTimeFormat } from '@/lib/formatLogTimestamp';

export type LevelFilter = LogLevel | 'all';
export type SortOrder = 'newest-bottom' | 'newest-top';
export type LogListItem =
  | { kind: 'log'; id: string; line: LogLine }
  | { kind: 'day'; id: string; label: string };

export const LEVEL_FILTERS: LevelFilter[] = ['all', 'info', 'warn', 'error', 'debug'];

export function levelDotColor(
  level: LevelFilter,
  colors: { success: string; warning: string; destructive: string; mutedForeground: string }
): string {
  switch (level) {
    case 'info':  return colors.success;
    case 'warn':  return colors.warning;
    case 'error': return colors.destructive;
    case 'debug': return colors.mutedForeground;
    default:      return colors.mutedForeground;
  }
}

export function calcSecsAgo(lastPollAt: number | null, now: number): number | null {
  if (lastPollAt === null) return null;
  return Math.max(0, Math.round((now - lastPollAt) / 1000));
}

export function buildDisplayNewestFirst(result: LogLine[], tzMode: LogTimeFormat): LogListItem[] {
  if (result.length === 0) return [];
  const items: LogListItem[] = [];
  let prevDayKey: string | null = null;

  for (let i = result.length - 1; i >= 0; i--) {
    const line = result[i]!;
    const key = line.ts ? logDayKey(line.ts, tzMode) : null;

    if (key && key !== 'invalid') {
      if (prevDayKey !== null && key !== prevDayKey) {
        items.push({
          kind: 'day',
          id: `day-${key}-${line.id}`,
          label: formatLogDay(line.ts!, tzMode),
        });
      }
      prevDayKey = key;
    }

    items.push({ kind: 'log', id: line.id, line });
  }

  return items;
}
