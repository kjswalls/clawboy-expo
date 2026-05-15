import { pickDistinct, pickDistinctInRange } from '../brandLoaderPick';

describe('pickDistinctInRange', () => {
  it('returns empty for non-positive bounds', () => {
    expect(pickDistinctInRange(3, 0)).toEqual([]);
    expect(pickDistinctInRange(3, -1)).toEqual([]);
    expect(pickDistinctInRange(0, 5)).toEqual([]);
  });

  it('returns at most maxExclusive distinct indices in range', () => {
    for (let t = 0; t < 50; t++) {
      const max = 20;
      const out = pickDistinctInRange(10, max);
      expect(out.length).toBeLessThanOrEqual(max);
      expect(new Set(out).size).toBe(out.length);
      for (const x of out) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(max);
      }
    }
  });

  it('caps at pool size when n exceeds maxExclusive', () => {
    const out = pickDistinctInRange(100, 4);
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(4);
  });
});

describe('pickDistinct', () => {
  it('delegates to nine-cell pool', () => {
    const out = pickDistinct(9);
    expect(out).toHaveLength(9);
    expect(new Set(out).size).toBe(9);
  });
});
