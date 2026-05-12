import { describe, it, expect } from '@jest/globals';
import { pickBestServerProfile } from '../pickBestServerProfile';
import type { ServerProfile } from '@/types';

function makeProfile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: 'prof-1',
    name: 'Test Server',
    url: 'wss://test.local',
    isActive: false,
    ...overrides,
  };
}

describe('pickBestServerProfile', () => {
  it('returns null for empty array', () => {
    expect(pickBestServerProfile([])).toBeNull();
  });

  it('returns the single profile when array has one element', () => {
    const p = makeProfile({ id: 'only' });
    expect(pickBestServerProfile([p])).toBe(p);
  });

  it('picks the more recently connected profile', () => {
    const older = makeProfile({ id: 'older', lastConnectedAt: 1000 });
    const newer = makeProfile({ id: 'newer', lastConnectedAt: 2000 });
    expect(pickBestServerProfile([older, newer])).toBe(newer);
    expect(pickBestServerProfile([newer, older])).toBe(newer);
  });

  it('breaks lastConnectedAt tie by preferring isActive=true', () => {
    const inactive = makeProfile({ id: 'inactive', lastConnectedAt: 5000, isActive: false });
    const active = makeProfile({ id: 'active', lastConnectedAt: 5000, isActive: true });
    expect(pickBestServerProfile([inactive, active])).toBe(active);
    expect(pickBestServerProfile([active, inactive])).toBe(active);
  });

  it('returns index-0 when no lastConnectedAt and neither isActive', () => {
    const a = makeProfile({ id: 'a', isActive: false });
    const b = makeProfile({ id: 'b', isActive: false });
    // Both have lastConnectedAt=undefined → treated as 0; neither active → index 0
    const result = pickBestServerProfile([a, b]);
    expect(result).toBe(a);
  });

  it('sorts three profiles by timestamp descending', () => {
    const p1 = makeProfile({ id: 'p1', lastConnectedAt: 100 });
    const p2 = makeProfile({ id: 'p2', lastConnectedAt: 300 });
    const p3 = makeProfile({ id: 'p3', lastConnectedAt: 200 });
    const result = pickBestServerProfile([p1, p2, p3]);
    expect(result).toBe(p2);
  });
});
