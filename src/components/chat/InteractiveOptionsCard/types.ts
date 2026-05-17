export const PRESS_ALPHA = '0A';
export const DISABLED_BG_ALPHA = '24';

/** Returns A, B, C … Z, then 1, 2, 3 … for indices beyond 25. */
export function badgeLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** Per-question answer state: picked choice value OR freeform text. */
export type QuestionAnswer = { picked?: string; freeText: string };

export function emptyAnswer(): QuestionAnswer {
  return { picked: undefined, freeText: '' };
}
