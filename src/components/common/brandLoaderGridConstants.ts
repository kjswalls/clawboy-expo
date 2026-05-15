/**
 * Large-variant 3×3 grid geometry for BrandLoader / BrandField.
 * Kept free of React Native so layout math and Jest logic tests can import it
 * without pulling in MaskedView, StyleSheet, etc.
 */

export const L_CELL = 14;
export const L_GAP = 2;
export const L_CENTER = 5;
export const L_PADDING = 2;

const L_GRID = 3 * L_CELL + 2 * L_GAP;
export const L_SIZE = L_GRID + 2 * L_PADDING;

export const L_GRAD = 76;
export const L_GRAD_OFFSET = (L_SIZE - L_GRAD) / 2;

/** Row index tuples for the 3×3 grid (avoids flexWrap + gap edge cases). */
export const GRID_ROWS = [[0, 1, 2], [3, 4, 5], [6, 7, 8]] as const;
