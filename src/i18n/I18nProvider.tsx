import React, { useContext, useEffect, useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n, { normalizeAppLanguage, applyLanguageDirection } from './index';
import { AuthContext } from '../context/authContextTypes';

interface I18nProviderProps {
  children: React.ReactNode;
}

/**
 * Syncs persisted userSettings.language to the i18next runtime,
 * applies document lang & dir attributes for RTL/LTR support,
 * and distributes i18next context to child components.
 *
 * Uses useContext(AuthContext) directly (which returns undefined outside a
 * provider) rather than useAuth() which throws — avoiding a Rules-of-Hooks
 * violation from calling a throwing hook inside try/catch.
 */
export function I18nProvider({ children }: I18nProviderProps): JSX.Element {
  // Safe: useContext returns undefined when the context is not provided,
  // which is the correct behaviour when I18nProvider is rendered above AuthProvider
  // (e.g. in tests that supply the context manually).
  const auth = useContext(AuthContext);
  const languageSetting = auth?.userSettings?.language ?? auth?.profile?.language;

  const activeLanguage = useMemo(
    () => normalizeAppLanguage(languageSetting ?? i18n.language),
    [languageSetting]
  );

  useEffect(() => {
    if (i18n.language !== activeLanguage) {
      void i18n.changeLanguage(activeLanguage);
    }
    applyLanguageDirection(activeLanguage);
  }, [activeLanguage]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
