import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitThemeToggled } from '@/badges/events';
import { Colors, Tokens } from '@/constants/theme';
import type { DensityTokens, UiDensity } from '@/constants/theme';
import type { DarkVariant, LightVariant, ThemeColors, ThemeMode } from '@/types';

const THEME_KEY_V4 = 'clawboy-theme-v4';
const THEME_KEY_V3 = 'clawboy-theme-v3';
const THEME_KEY_V2 = 'clawboy-theme-v2';
const THEME_KEY_V1 = 'clawboy-theme-v1';

interface ThemeV4Stored { mode: ThemeMode; darkVariant: DarkVariant; lightVariant: LightVariant; density: UiDensity }
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
  density: UiDensity;
  setDensity: (density: UiDensity) => void;
  tokens: DensityTokens;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const sys = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [darkVariant, setDarkVariantState] = useState<DarkVariant>('dark');
  const [lightVariant, setLightVariantState] = useState<LightVariant>('default');
  const [density, setDensityState] = useState<UiDensity>('comfortable');

  // Refs so persist callbacks don't need to be recreated when state changes.
  const themeModeRef = useRef<ThemeMode>('system');
  const darkVariantRef = useRef<DarkVariant>('dark');
  const lightVariantRef = useRef<LightVariant>('default');
  const densityRef = useRef<UiDensity>('comfortable');

  useEffect(() => { themeModeRef.current = themeMode; }, [themeMode]);
  useEffect(() => { darkVariantRef.current = darkVariant; }, [darkVariant]);
  useEffect(() => { lightVariantRef.current = lightVariant; }, [lightVariant]);
  useEffect(() => { densityRef.current = density; }, [density]);

  const persistV4 = useCallback((
    mode: ThemeMode,
    dark: DarkVariant,
    light: LightVariant,
    d: UiDensity,
  ): void => {
    const payload: ThemeV4Stored = { mode, darkVariant: dark, lightVariant: light, density: d };
    void AsyncStorage.setItem(THEME_KEY_V4, JSON.stringify(payload)).catch(() => { /* ignore */ });
  }, []);

  // Hydrate from storage on mount with v1/v2/v3 → v4 migration.
  useEffect(() => {
    void (async (): Promise<void> => {
      const v4raw = await AsyncStorage.getItem(THEME_KEY_V4);
      if (v4raw) {
        try {
          const parsed = JSON.parse(v4raw) as Partial<ThemeV4Stored>;
          const mode = parsed.mode ?? 'system';
          const dark = parsed.darkVariant ?? 'dark';
          const light = parsed.lightVariant ?? 'default';
          const d: UiDensity = parsed.density ?? 'comfortable';
          setThemeModeState(mode);
          setDarkVariantState(dark);
          setLightVariantState(light);
          setDensityState(d);
          themeModeRef.current = mode;
          darkVariantRef.current = dark;
          lightVariantRef.current = light;
          densityRef.current = d;
          return;
        } catch { /* fall through to v3 migration */ }
      }

      // Migrate from v3.
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
          persistV4(mode, dark, light, 'comfortable');
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
          persistV4(mode, dark, 'default', 'comfortable');
          return;
        } catch { /* fall through to v1 migration */ }
      }

      // Migrate from v1.
      const v1 = await AsyncStorage.getItem(THEME_KEY_V1);
      if (v1 === 'light') {
        setThemeModeState('light');
        themeModeRef.current = 'light';
        persistV4('light', 'dark', 'default', 'comfortable');
      } else if (v1 === 'dark') {
        setThemeModeState('dark');
        themeModeRef.current = 'dark';
        persistV4('dark', 'dark', 'default', 'comfortable');
      } else if (v1 === 'darkBlue') {
        setThemeModeState('dark');
        setDarkVariantState('darkBlue');
        themeModeRef.current = 'dark';
        darkVariantRef.current = 'darkBlue';
        persistV4('dark', 'darkBlue', 'default', 'comfortable');
      }
      // No v1 key → keep defaults (system + dark variant + comfortable density).
    })();
  }, [persistV4]);

  const setThemeMode = useCallback((mode: ThemeMode): void => {
    setThemeModeState(mode);
    themeModeRef.current = mode;
    persistV4(mode, darkVariantRef.current, lightVariantRef.current, densityRef.current);
    emitThemeToggled();
  }, [persistV4]);

  const setDarkVariant = useCallback((variant: DarkVariant): void => {
    setDarkVariantState(variant);
    darkVariantRef.current = variant;
    persistV4(themeModeRef.current, variant, lightVariantRef.current, densityRef.current);
  }, [persistV4]);

  const setLightVariant = useCallback((variant: LightVariant): void => {
    setLightVariantState(variant);
    lightVariantRef.current = variant;
    persistV4(themeModeRef.current, darkVariantRef.current, variant, densityRef.current);
  }, [persistV4]);

  const setDensity = useCallback((d: UiDensity): void => {
    setDensityState(d);
    densityRef.current = d;
    persistV4(themeModeRef.current, darkVariantRef.current, lightVariantRef.current, d);
  }, [persistV4]);

  const resolvedScheme = useMemo((): 'light' | 'dark' => {
    if (themeMode === 'system') return sys === 'light' ? 'light' : 'dark';
    return themeMode;
  }, [themeMode, sys]);

  const colors = useMemo((): ThemeColors => {
    if (resolvedScheme === 'light') {
      if (lightVariant === 'githubLight') return Colors.githubLight;
      if (lightVariant === 'solarizedLight') return Colors.solarizedLight;
      if (lightVariant === 'oneLight') return Colors.oneLight;
      if (lightVariant === 'parasol') return Colors.parasol;
      if (lightVariant === 'cowgirlLight') return Colors.cowgirlLight;
      return Colors.light;
    }
    if (darkVariant === 'darkBlue') return Colors.darkBlue;
    if (darkVariant === 'oneDarkPro') return Colors.oneDarkPro;
    if (darkVariant === 'tokyoNight') return Colors.tokyoNight;
    if (darkVariant === 'cowgirlDark') return Colors.cowgirlDark;
    if (darkVariant === 'foundersAmber') return Colors.foundersAmber;
    if (darkVariant === 'foundersAurora') return Colors.foundersAurora;
    return Colors.dark;
  }, [resolvedScheme, darkVariant, lightVariant]);

  const tokens = useMemo((): DensityTokens => Tokens[density], [density]);

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
      density,
      setDensity,
      tokens,
    }),
    [themeMode, setThemeMode, darkVariant, setDarkVariant, lightVariant, setLightVariant, resolvedScheme, colors, density, setDensity, tokens]
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
