import { useThemeContext } from '@/contexts/ThemeContext';
import type { DensityTokens } from '@/constants/theme';

export interface TokenSet {
  /** Font size scale for the active density. */
  fs: DensityTokens['font'];
  /** Spacing scale for the active density. */
  sp: DensityTokens['spacing'];
  /** Minimum recommended touch-target size (px). */
  minTouch: DensityTokens['minTouch'];
  /** Icon size — small (inline text icons, badges). */
  iconSm: DensityTokens['iconSm'];
  /** Icon size — medium (action bar, header buttons). */
  iconMd: DensityTokens['iconMd'];
  /** Icon size — large (empty state, prominent UI). */
  iconLg: DensityTokens['iconLg'];
}

/**
 * Returns the token set for the currently selected UI density.
 *
 * Use in components that should respond to the Compact / Comfortable / Spacious
 * setting. Components that don't need dynamic density can keep importing the
 * static `FontSize` / `Spacing` exports from `@/constants/theme` — those are
 * already aliased to the Comfortable (default) values.
 */
export function useTokens(): TokenSet {
  const { tokens } = useThemeContext();
  return {
    fs: tokens.font,
    sp: tokens.spacing,
    minTouch: tokens.minTouch,
    iconSm: tokens.iconSm,
    iconMd: tokens.iconMd,
    iconLg: tokens.iconLg,
  };
}
