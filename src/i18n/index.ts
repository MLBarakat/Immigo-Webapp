import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import arSAAccount from './locales/ar-SA/account.json';
import arSACommon from './locales/ar-SA/common.json';
import arSAConversation from './locales/ar-SA/conversation.json';
import arSASettings from './locales/ar-SA/settings.json';

import enUSAccount from './locales/en-US/account.json';
import enUSCommon from './locales/en-US/common.json';
import enUSConversation from './locales/en-US/conversation.json';
import enUSSettings from './locales/en-US/settings.json';

import esESAccount from './locales/es-ES/account.json';
import esESCommon from './locales/es-ES/common.json';
import esESConversation from './locales/es-ES/conversation.json';
import esESSettings from './locales/es-ES/settings.json';

import frFRAccount from './locales/fr-FR/account.json';
import frFRCommon from './locales/fr-FR/common.json';
import frFRConversation from './locales/fr-FR/conversation.json';
import frFRSettings from './locales/fr-FR/settings.json';

export const DEFAULT_LANGUAGE = 'en-US';
export const SUPPORTED_LANGUAGE_CODES = ['en-US', 'es-ES', 'fr-FR', 'ar-SA'] as const;
export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export const NAMESPACES = ['common', 'settings', 'account', 'conversation'] as const;
export type AppNamespace = (typeof NAMESPACES)[number];

export function normalizeAppLanguage(language?: string | null): SupportedLanguageCode {
  return SUPPORTED_LANGUAGE_CODES.includes(language as SupportedLanguageCode)
    ? (language as SupportedLanguageCode)
    : DEFAULT_LANGUAGE;
}

export function getLanguageDirection(languageCode?: string | null): 'rtl' | 'ltr' {
  const normalized = normalizeAppLanguage(languageCode);
  return normalized === 'ar-SA' ? 'rtl' : 'ltr';
}

export function applyLanguageDirection(languageCode?: string | null): 'rtl' | 'ltr' {
  const dir = getLanguageDirection(languageCode);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = normalizeAppLanguage(languageCode);
    document.documentElement.dir = dir;
  }
  return dir;
}

export const resources = {
  'ar-SA': {
    common: arSACommon,
    settings: arSASettings,
    account: arSAAccount,
    conversation: arSAConversation,
  },
  'en-US': {
    common: enUSCommon,
    settings: enUSSettings,
    account: enUSAccount,
    conversation: enUSConversation,
  },
  'es-ES': {
    common: esESCommon,
    settings: esESSettings,
    account: esESAccount,
    conversation: esESConversation,
  },
  'fr-FR': {
    common: frFRCommon,
    settings: frFRSettings,
    account: frFRAccount,
    conversation: frFRConversation,
  },
} as const;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    ns: ['common', 'settings', 'account', 'conversation'],
    defaultNS: 'common',
    fallbackNS: ['common', 'settings', 'account', 'conversation'],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

i18n.on('languageChanged', (lng) => {
  applyLanguageDirection(lng);
});

// Initial direction application if in browser
if (typeof document !== 'undefined') {
  applyLanguageDirection(i18n.language || DEFAULT_LANGUAGE);
}

export default i18n;
