/**
 * Converts a hex color string (#RGB or #RRGGBB) to an rgba() string.
 * Using rgba with matching RGB values (instead of the 'transparent' keyword)
 * prevents iOS from tinting gradients through black when alpha reaches 0.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
