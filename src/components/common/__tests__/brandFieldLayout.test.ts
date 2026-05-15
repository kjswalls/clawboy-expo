import {
  BRAND_FIELD_TILE_GAP,
  computeBrandFieldGrid,
  nineCellLayoutsInTile,
} from '../brandFieldLayout';
import {
  L_CELL,
  L_CENTER,
  L_PADDING,
  L_SIZE,
} from '../brandLoaderGridConstants';

describe('brandFieldLayout', () => {
  describe('nineCellLayoutsInTile', () => {
    it('returns nine cells in row-major GRID_ROWS order', () => {
      const layouts = nineCellLayoutsInTile();
      expect(layouts).toHaveLength(9);
    });

    it('places top-left cell at inner padding with standard cell size', () => {
      const [first] = nineCellLayoutsInTile();
      expect(first.x).toBe(L_PADDING);
      expect(first.y).toBe(L_PADDING);
      expect(first.width).toBe(L_CELL);
      expect(first.height).toBe(L_CELL);
    });

    it('uses smaller center dimensions for the middle cell (index 4)', () => {
      const layouts = nineCellLayoutsInTile();
      const center = layouts[4];
      expect(center).toBeDefined();
      expect(center!.width).toBe(L_CENTER);
      expect(center!.height).toBe(L_CENTER);
    });
  });

  describe('computeBrandFieldGrid', () => {
    it('returns zero tiles when neither dimension can fit one stride', () => {
      const tooNarrow = L_SIZE + BRAND_FIELD_TILE_GAP - BRAND_FIELD_TILE_GAP - 1;
      const g = computeBrandFieldGrid(tooNarrow, tooNarrow);
      expect(g.cols).toBe(0);
      expect(g.rows).toBe(0);
      expect(g.tileCount).toBe(0);
    });

    it('fits exactly one tile in a square of one stride and centers it', () => {
      const stride = L_SIZE + BRAND_FIELD_TILE_GAP;
      const g = computeBrandFieldGrid(stride, stride);
      expect(g.cols).toBe(1);
      expect(g.rows).toBe(1);
      expect(g.tileCount).toBe(1);
      expect(g.originX).toBeCloseTo((stride - L_SIZE) / 2);
      expect(g.originY).toBeCloseTo((stride - L_SIZE) / 2);
    });

    it('centers the grid in the field', () => {
      const g = computeBrandFieldGrid(400, 300);
      const totalW = g.cols * L_SIZE + Math.max(0, g.cols - 1) * BRAND_FIELD_TILE_GAP;
      const totalH = g.rows * L_SIZE + Math.max(0, g.rows - 1) * BRAND_FIELD_TILE_GAP;
      expect(g.originX).toBeCloseTo((400 - totalW) / 2);
      expect(g.originY).toBeCloseTo((300 - totalH) / 2);
    });

    it('caps at 8×8 tiles on very large fields', () => {
      const g = computeBrandFieldGrid(10_000, 10_000);
      expect(g.cols).toBeLessThanOrEqual(8);
      expect(g.rows).toBeLessThanOrEqual(8);
      expect(g.tileCount).toBe(g.cols * g.rows);
      expect(g.tileCount).toBe(64);
    });
  });
});
