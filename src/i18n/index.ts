import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en/common.json';
import enAboutCollapsible from './locales/en/aboutCollapsible.json';
import zhCN from './locales/zh-CN/common.json';
import zhCNAboutCollapsible from './locales/zh-CN/aboutCollapsible.json';

/**
 * Detect the initial UI language from the device locale synchronously so the
 * very first frame is correctly localised — no flash of English on zh devices.
 *
 * Only zh-Hans tags (Simplified Chinese) resolve to 'zh-CN'. zh-Hant locales
 * (zh-TW, zh-HK) fall back to English until a Traditional Chinese bundle ships.
 */
function getInitialLanguage(): string {
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

i18n
  .use(initReactI18next)
  .init({
    // Bundle both locales statically — synchronous `t()` from first paint, no I/O.
    resources: {
      en: {
        common: {
          ...en,
          about: {
            ...en.about,
            ...enAboutCollapsible,
          },
        },
      },
      'zh-CN': {
        common: {
          ...zhCN,
          about: {
            ...zhCN.about,
            ...zhCNAboutCollapsible,
          },
        },
      },
    },
    // Resolve system language synchronously so the first frame is correctly localised.
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    // The single namespace is called 'common'. Inside the JSON file the top-level
    // key is also 'common' (e.g. common.cancel), which looks redundant but is
    // intentional — the namespace name and the first key segment are separate
    // identifiers. t('common.cancel') resolves as: namespace=common, key=common.cancel.
    defaultNS: 'common',
    ns: ['common'],

    interpolation: {
      escapeValue: false,
    },

    // Initialise synchronously — resources are already bundled so there is no I/O
    // to defer. This also ensures `t()` returns real text during tests (and on the
    // first render in production) rather than falling back to the key path.
    initImmediate: false,

    // Disable React Suspense — not compatible with React Native's synchronous render.
    react: {
      useSuspense: false,
    },

    // Surface missing keys in dev so nothing silently falls through to a key path.
    ...(process.env.NODE_ENV === 'development' && {
      saveMissing: true,
      missingKeyHandler: (_lngs: readonly string[], _ns: string, key: string) => {
        if (__DEV__) {
          console.warn(`[i18n] Missing key: "${key}"`);
        }
      },
    }),
  })
  .catch((err: unknown) => {
    console.error('[i18n] init error', err);
  });

export default i18n;
