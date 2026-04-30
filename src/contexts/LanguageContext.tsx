import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from '@/i18n';

export type LanguagePreference = 'system' | 'en' | 'zh-CN';
export type ResolvedLanguage = 'en' | 'zh-CN';

const LANGUAGE_KEY = 'clawboy-language-v1';

interface LanguageContextValue {
  language: LanguagePreference;
  setLanguage: (lang: LanguagePreference) => void;
  resolvedLanguage: ResolvedLanguage;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Detect the device's primary system language.
 *
 * Only zh-Hans (Simplified Chinese) tags map to 'zh-CN'. zh-Hant locales
 * (zh-TW, zh-HK) fall back to English until a Traditional Chinese bundle ships.
 */
function resolveSystemLanguage(): ResolvedLanguage {
  try {
    const tag = getLocales()[0]?.languageTag ?? '';
    if (
      tag.startsWith('zh-Hans') ||
      tag.startsWith('zh-CN') ||
      tag === 'zh-SG' ||
      tag === 'zh'
    ) {
      return 'zh-CN';
    }
  } catch {
    // expo-localization unavailable — fall back to English
  }
  return 'en';
}

function resolveLanguage(pref: LanguagePreference): ResolvedLanguage {
  if (pref === 'system') return resolveSystemLanguage();
  return pref;
}

export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [language, setLanguageState] = useState<LanguagePreference>('system');
  // Resolved language is explicit state (not derived via useMemo) so it can be
  // updated independently when the OS locale changes while the app is backgrounded.
  const [resolvedLanguage, setResolvedLanguage] = useState<ResolvedLanguage>(resolveSystemLanguage);

  // Hydrate stored preference from AsyncStorage on mount.
  useEffect(() => {
    void (async (): Promise<void> => {
      const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (stored === 'en' || stored === 'zh-CN' || stored === 'system') {
        const resolved = resolveLanguage(stored);
        setLanguageState(stored);
        setResolvedLanguage(resolved);
        void i18n.changeLanguage(resolved);
      }
      // First launch (no stored pref): i18n was already initialised to the
      // system language in src/i18n/index.ts; state is already correct.
    })();
  }, []);

  // When the preference is 'system', re-check the OS locale each time the app
  // returns to the foreground — the user may have changed their device language.
  useEffect(() => {
    if (language !== 'system') return;
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const newResolved = resolveSystemLanguage();
        if (newResolved !== i18n.language) {
          setResolvedLanguage(newResolved);
          void i18n.changeLanguage(newResolved);
        }
      }
    });
    return () => sub.remove();
  }, [language]);

  const setLanguage = useCallback((lang: LanguagePreference): void => {
    const resolved = resolveLanguage(lang);
    setLanguageState(lang);
    setResolvedLanguage(resolved);
    void i18n.changeLanguage(resolved);
    void AsyncStorage.setItem(LANGUAGE_KEY, lang).catch(() => { /* ignore */ });
  }, []);

  const value = useMemo(
    (): LanguageContextValue => ({ language, setLanguage, resolvedLanguage }),
    [language, setLanguage, resolvedLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
