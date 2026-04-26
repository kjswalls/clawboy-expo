import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';
import type { DarkVariant, LightVariant, ThemeColors, ThemeMode } from '@/types';

const THEME_KEY_V3 = 'clawboy-theme-v3';
const THEME_KEY_V2 = 'clawboy-theme-v2';
const THEME_KEY_V1 = 'clawboy-theme-v1';

interface ThemeV3Stored { mode: ThemeMode; darkVariant: DarkVariant; lightVariant: LightVariant }
interface ThemeV2Stored { mode: ThemeMode; variant: DarkVariant }

interface ThemeContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  darkVariant: DarkVariant;
  setDarkVariant: (variant: DarkVariant) => void;
  lightVariant: LightVariant;
  setLightVariant: (variant: LightVariant) => void;
  resolvedScheme: 'light' | 'dark';
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const sys = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [darkVariant, setDarkVariantState] = useState<DarkVariant>('dark');
  const [lightVariant, setLightVariantState] = useState<LightVariant>('default');

  // Refs so persist callbacks don't need to be recreated when state changes.
  const themeModeRef = useRef<ThemeMode>('system');
  const darkVariantRef = useRef<DarkVariant>('dark');
  const lightVariantRef = useRef<LightVariant>('default');

  useEffect(() => { themeModeRef.current = themeMode; }, [themeMode]);
  useEffect(() => { darkVariantRef.current = darkVariant; }, [darkVariant]);
  useEffect(() => { lightVariantRef.current = lightVariant; }, [lightVariant]);

  const persistV3 = useCallback((mode: ThemeMode, dark: DarkVariant, light: LightVariant): void => {
    const payload: ThemeV3Stored = { mode, darkVariant: dark, lightVariant: light };
    void AsyncStorage.setItem(THEME_KEY_V3, JSON.stringify(payload)).catch(() => { /* ignore */ });
  }, []);

  // Hydrate from storage on mount with v1/v2 → v3 migration.
  useEffect(() => {
    void (async (): Promise<void> => {
      const v3raw = await AsyncStorage.getItem(THEME_KEY_V3);
      if (v3raw) {
        try {
          const parsed = JSON.parse(v3raw) as Partial<ThemeV3Stored>;
          const mode = parsed.mode ?? 'system';
          const dark = parsed.darkVariant ?? 'dark';
          const light = parsed.lightVariant ?? 'default';
          setThemeModeState(mode);
          setDarkVariantState(dark);
          setLightVariantState(light);
          themeModeRef.current = mode;
          darkVariantRef.current = dark;
          lightVariantRef.current = light;
          return;
        } catch { /* fall through to v2 migration */ }
      }

      // Migrate from v2.
      const v2raw = await AsyncStorage.getItem(THEME_KEY_V2);
      if (v2raw) {
        try {
          const parsed = JSON.parse(v2raw) as Partial<ThemeV2Stored>;
          const mode = parsed.mode ?? 'system';
          const dark = parsed.variant ?? 'dark';
          setThemeModeState(mode);
          setDarkVariantState(dark);
          themeModeRef.current = mode;
          darkVariantRef.current = dark;
          persistV3(mode, dark, 'default');
          return;
        } catch { /* fall through to v1 migration */ }
      }

      // Migrate from v1.
      const v1 = await AsyncStorage.getItem(THEME_KEY_V1);
      if (v1 === 'light') {
        setThemeModeState('light');
        themeModeRef.current = 'light';
        persistV3('light', 'dark', 'default');
      } else if (v1 === 'dark') {
        setThemeModeState('dark');
        themeModeRef.current = 'dark';
        persistV3('dark', 'dark', 'default');
      } else if (v1 === 'darkBlue') {
        setThemeModeState('dark');
        setDarkVariantState('darkBlue');
        themeModeRef.current = 'dark';
        darkVariantRef.current = 'darkBlue';
        persistV3('dark', 'darkBlue', 'default');
      }
      // No v1 key → keep defaults (system + dark variant).
    })();
  }, [persistV3]);

  const setThemeMode = useCallback((mode: ThemeMode): void => {
    setThemeModeState(mode);
    themeModeRef.current = mode;
    persistV3(mode, darkVariantRef.current, lightVariantRef.current);
  }, [persistV3]);

  const setDarkVariant = useCallback((variant: DarkVariant): void => {
    setDarkVariantState(variant);
    darkVariantRef.current = variant;
    persistV3(themeModeRef.current, variant, lightVariantRef.current);
  }, [persistV3]);

  const setLightVariant = useCallback((variant: LightVariant): void => {
    setLightVariantState(variant);
    lightVariantRef.current = variant;
    persistV3(themeModeRef.current, darkVariantRef.current, variant);
  }, [persistV3]);

  const resolvedScheme = useMemo((): 'light' | 'dark' => {
    if (themeMode === 'system') return sys === 'light' ? 'light' : 'dark';
    return themeMode;
  }, [themeMode, sys]);

  const colors = useMemo((): ThemeColors => {
    if (resolvedScheme === 'light') {
      if (lightVariant === 'githubLight') return Colors.githubLight;
      if (lightVariant === 'solarizedLight') return Colors.solarizedLight;
      if (lightVariant === 'oneLight') return Colors.oneLight;
      return Colors.light;
    }
    if (darkVariant === 'darkBlue') return Colors.darkBlue;
    if (darkVariant === 'oneDarkPro') return Colors.oneDarkPro;
    if (darkVariant === 'dracula') return Colors.dracula;
    if (darkVariant === 'tokyoNight') return Colors.tokyoNight;
    return Colors.dark;
  }, [resolvedScheme, darkVariant, lightVariant]);

  const value = useMemo(
    (): ThemeContextValue => ({
      themeMode,
      setThemeMode,
      darkVariant,
      setDarkVariant,
      lightVariant,
      setLightVariant,
      resolvedScheme,
      colors,
    }),
    [themeMode, setThemeMode, darkVariant, setDarkVariant, lightVariant, setLightVariant, resolvedScheme, colors]
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
