import { useThemeContext } from '@/contexts/ThemeContext';

/** Theme mode, persistence, and resolved `colors` from `constants/theme`. */
export function useTheme(): ReturnType<typeof useThemeContext> {
  return useThemeContext();
}
