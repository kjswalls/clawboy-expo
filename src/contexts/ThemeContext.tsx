import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';
import type { ThemeColors, ThemeMode } from '@/types';

const THEME_STORAGE_KEY = 'clawboy-theme-v1';

interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    void AsyncStorage.getItem(THEME_STORAGE_KEY).then((raw) => {
      if (raw === 'light' || raw === 'dark') {
        setThemeState(raw);
      }
    });
  }, []);

  const setTheme = useCallback((next: ThemeMode): void => {
    setThemeState(next);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {
      /* ignore */
    });
  }, []);

  const toggleTheme = useCallback((): void => {
    setThemeState((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const colors = useMemo((): ThemeColors => (theme === 'light' ? Colors.light : Colors.dark), [theme]);

  const value = useMemo(
    (): ThemeContextValue => ({
      theme,
      toggleTheme,
      setTheme,
      colors,
    }),
    [theme, toggleTheme, setTheme, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return ctx;
}
