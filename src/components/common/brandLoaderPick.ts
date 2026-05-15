/** Returns up to `n` distinct random indices in `[0, maxExclusive)`. */
export function pickDistinctInRange(n: number, maxExclusive: number): number[] {
  if (maxExclusive <= 0 || n <= 0) {
    return [];
  }
  const cap = Math.min(n, maxExclusive);
  const pool = Array.from({ length: maxExclusive }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < cap && pool.length > 0; i++) {
    const j = Math.floor(Math.random() * pool.length);
    const picked = pool.splice(j, 1)[0];
    if (picked === undefined) {
      break;
    }
    out.push(picked);
  }
  return out;
}

/** Returns `n` distinct random indices in [0, 9). */
export function pickDistinct(n: number): number[] {
  return pickDistinctInRange(n, 9);
}
