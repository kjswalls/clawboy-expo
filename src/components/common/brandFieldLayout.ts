/**
 * Pure layout math for BrandField (Skia) — mirrors RN TileSquares / BrandField grid.
 *
 * **`BRAND_FIELD_TILE_GAP`** is the single source of truth for gap between tiles (pt).
 * Import it from this module wherever tile stride is needed; do not duplicate.
 */

import {
  GRID_ROWS,
  L_CELL,
  L_CENTER,
  L_GAP,
  L_PADDING,
  L_SIZE,
} from './brandLoaderGridConstants';

/** Gap between adjacent tiles (pt). Single source of truth for BrandField grid stride. */
export const BRAND_FIELD_TILE_GAP = 10;

/** Maximum tiles per axis (pool size). Must match BrandField MAX_TILES math. */
const MAX_AXIS = 8;

export type BrandFieldCellLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
};

const CELL_RX = Math.round(L_CELL * 0.22);
const CENTER_RX = Math.round(L_CENTER / 2);

/** Nine cell layouts relative to tile top-left (0,0 = outer tile box). */
export function nineCellLayoutsInTile(): BrandFieldCellLayout[] {
  const rowY = (rowIdx: number): number => L_PADDING + rowIdx * (L_CELL + L_GAP);
  const layouts: BrandFieldCellLayout[] = [];
  for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
    const yRow = rowY(rowIdx);
    for (const cellIdx of GRID_ROWS[rowIdx]!) {
      const col = cellIdx % 3;
      const slotX = L_PADDING + col * (L_CELL + L_GAP);
      const isCenter = cellIdx === 4;
      const w = isCenter ? L_CENTER : L_CELL;
      const h = isCenter ? L_CENTER : L_CELL;
      const x = isCenter ? slotX + (L_CELL - L_CENTER) / 2 : slotX;
      const y = isCenter ? yRow + (L_CELL - L_CENTER) / 2 : yRow;
      const rx = isCenter ? CENTER_RX : CELL_RX;
      layouts.push({ x, y, width: w, height: h, rx });
    }
  }
  return layouts;
}

export const NINE_CELL_LAYOUTS = nineCellLayoutsInTile();

export function computeBrandFieldGrid(
  width: number,
  height: number,
): { cols: number; rows: number; tileCount: number; originX: number; originY: number } {
  const stride = L_SIZE + BRAND_FIELD_TILE_GAP;
  const cols = Math.min(MAX_AXIS, Math.floor((width + BRAND_FIELD_TILE_GAP) / stride));
  const rows = Math.min(MAX_AXIS, Math.floor((height + BRAND_FIELD_TILE_GAP) / stride));
  const tileCount = cols * rows;
  const totalW = cols * L_SIZE + Math.max(0, cols - 1) * BRAND_FIELD_TILE_GAP;
  const totalH = rows * L_SIZE + Math.max(0, rows - 1) * BRAND_FIELD_TILE_GAP;
  const originX = (width - totalW) / 2;
  const originY = (height - totalH) / 2;
  return { cols, rows, tileCount, originX, originY };
}
