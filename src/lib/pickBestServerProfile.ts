import type { ServerProfile } from '@/types';

/**
 * Picks the most-recently-connected profile from the list.
 * Falls back to the one flagged `isActive` if no `lastConnectedAt` is set.
 */
export function pickBestServerProfile(profiles: ServerProfile[]): ServerProfile | null {
  if (profiles.length === 0) {
    return null;
  }
  const sorted = [...profiles].sort((a, b) => {
    const aT = a.lastConnectedAt ?? 0;
    const bT = b.lastConnectedAt ?? 0;
    if (bT !== aT) {
      return bT - aT;
    }
    return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
  });
  return sorted[0] ?? null;
}
