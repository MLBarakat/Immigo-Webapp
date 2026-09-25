import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import arSA from './locales/ar-SA/common.json';
import enUS from './locales/en-US/common.json';
import esES from './locales/es-ES/common.json';
import frFR from './locales/fr-FR/common.json';

export const DEFAULT_LANGUAGE = 'en-US';
export const SUPPORTED_LANGUAGE_CODES = ['en-US', 'es-ES', 'fr-FR', 'ar-SA'] as const;
export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGE_CODES[number];

export function normalizeAppLanguage(language?: string | null): SupportedLanguageCode {
  return SUPPORTED_LANGUAGE_CODES.includes(language as SupportedLanguageCode)
    ? language as SupportedLanguageCode
    : DEFAULT_LANGUAGE;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'ar-SA': { common: arSA },
      'en-US': { common: enUS },
      'es-ES': { common: esES },
      'fr-FR': { common: frFR },
    },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

export default i18n;
