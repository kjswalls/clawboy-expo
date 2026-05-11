import { useThemeContext } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/types';
import type { DensityTokens, UiDensity } from '@/constants/theme';

/**
 * Public theme surface for general components.
 * Settings/variant-picker screens that need theme setters should call
 * `useThemeContext()` directly.
 */
export interface UseThemeResult {
  colors: ThemeColors;
  resolvedScheme: 'light' | 'dark';
  density: UiDensity;
  tokens: DensityTokens;
}

export function useTheme(): UseThemeResult {
  const { colors, resolvedScheme, density, tokens } = useThemeContext();
  return { colors, resolvedScheme, density, tokens };
}
