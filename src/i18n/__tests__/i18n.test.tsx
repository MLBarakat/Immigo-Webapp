import { render, screen, act, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import i18n, {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGE_CODES,
  normalizeAppLanguage,
  getLanguageDirection,
  applyLanguageDirection,
  resources,
} from '../index';
import { I18nProvider } from '../I18nProvider';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../../context/authContextTypes';
import type { AuthContextType } from '../../context/authContextTypes';

function TestSettingsConsumer() {
  const { t } = useTranslation('settings');
  return (
    <div>
      <h1 data-testid="settings-title">{t('title')}</h1>
      <p data-testid="appearance-title">{t('appearance.title')}</p>
    </div>
  );
}

function TestAccountConsumer() {
  const { t } = useTranslation('account');
  return (
    <div>
      <h1 data-testid="account-title">{t('title')}</h1>
      <span data-testid="profile-name-label">{t('profile.fullName')}</span>
    </div>
  );
}

function TestConversationConsumer() {
  const { t } = useTranslation('conversation');
  return (
    <div>
      <p data-testid="no-messages">{t('noMessages')}</p>
      <p data-testid="error-message">{t('systemError', { message: 'Buffer fault' })}</p>
    </div>
  );
}

describe('i18n configuration and utilities', () => {
  beforeEach(async () => {
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = DEFAULT_LANGUAGE;
  });

  it('normalizes languages accurately', () => {
    expect(normalizeAppLanguage('es-ES')).toBe('es-ES');
    expect(normalizeAppLanguage('fr-FR')).toBe('fr-FR');
    expect(normalizeAppLanguage('ar-SA')).toBe('ar-SA');
    expect(normalizeAppLanguage('en-US')).toBe('en-US');
    expect(normalizeAppLanguage('invalid-locale')).toBe(DEFAULT_LANGUAGE);
    expect(normalizeAppLanguage(null)).toBe(DEFAULT_LANGUAGE);
    expect(normalizeAppLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
  });

  it('determines language direction correctly', () => {
    expect(getLanguageDirection('ar-SA')).toBe('rtl');
    expect(getLanguageDirection('en-US')).toBe('ltr');
    expect(getLanguageDirection('es-ES')).toBe('ltr');
    expect(getLanguageDirection('fr-FR')).toBe('ltr');
  });

  it('applies direction and lang to document element for Arabic', () => {
    applyLanguageDirection('ar-SA');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar-SA');

    applyLanguageDirection('en-US');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('has translation resources defined for all supported locales and namespaces', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(resources[code]).toBeDefined();
      expect(resources[code].common).toBeDefined();
      expect(resources[code].settings).toBeDefined();
      expect(resources[code].account).toBeDefined();
      expect(resources[code].conversation).toBeDefined();
    }
  });

  it('provides matching workspace translation keys for every supported locale', () => {
    const flattenKeys = (value: unknown, prefix = ''): string[] => {
      if (typeof value !== 'object' || value === null) return [prefix];
      return Object.entries(value).flatMap(([key, child]) =>
        flattenKeys(child, prefix ? `${prefix}.${key}` : key)
      );
    };
    const englishKeys = flattenKeys(resources['en-US'].conversation.workspace).sort();

    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(flattenKeys(resources[code].conversation.workspace).sort()).toEqual(englishKeys);
    }

    expect(i18n.t('workspace.center.title', { ns: 'conversation', lng: 'es-ES' })).toBe('Entrevista de naturalización');
    expect(i18n.t('workspace.right.title', { ns: 'conversation', lng: 'fr-FR' })).toBe('Configuration et commandes');
    expect(i18n.t('workspace.left.title', { ns: 'conversation', lng: 'ar-SA' })).toBe('التعلّم والموارد');
  });

  it('renders settings namespace translations and responds to language changes', async () => {
    const { rerender } = render(
      <I18nProvider>
        <TestSettingsConsumer />
      </I18nProvider>
    );

    expect(screen.getByTestId('settings-title').textContent).toBe('Application Settings');
    expect(screen.getByTestId('appearance-title').textContent).toBe('Appearance');

    await act(async () => {
      await i18n.changeLanguage('es-ES');
    });

    rerender(
      <I18nProvider>
        <TestSettingsConsumer />
      </I18nProvider>
    );

    expect(screen.getByTestId('settings-title').textContent).toBe('Configuración de la aplicación');
    expect(screen.getByTestId('appearance-title').textContent).toBe('Apariencia');

    await act(async () => {
      await i18n.changeLanguage('ar-SA');
    });

    rerender(
      <I18nProvider>
        <TestSettingsConsumer />
      </I18nProvider>
    );

    expect(screen.getByTestId('settings-title').textContent).toBe('إعدادات التطبيق');
    expect(screen.getByTestId('appearance-title').textContent).toBe('المظهر');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('renders account namespace translations', () => {
    render(
      <I18nProvider>
        <TestAccountConsumer />
      </I18nProvider>
    );

    expect(screen.getByTestId('account-title').textContent).toBe('Account Settings');
    expect(screen.getByTestId('profile-name-label').textContent).toBe('Full Name');
  });

  it('renders conversation namespace with interpolated parameters', () => {
    render(
      <I18nProvider>
        <TestConversationConsumer />
      </I18nProvider>
    );

    expect(screen.getByTestId('no-messages').textContent).toContain('No conversational messages');
    expect(screen.getByTestId('error-message').textContent).toBe('System Intercept Exception: Buffer fault');
  });

  it('syncs persisted userSettings.language from AuthContext into i18next runtime', async () => {
    const mockAuthContext: AuthContextType = {
      session: null,
      user: null,
      profile: null,
      loading: false,
      initializationError: null,
      retryInitialization: vi.fn(),
      userSettings: {
        language: 'fr-FR',
        theme: 'system',
        ai_voice_id: 'Celine',
        live_feedback_enabled: true,
        mic_mode: 'voice_activity',
        barge_in: 'balanced',
        progress_report_frequency: 'weekly',
        font_size: 'default',
      },
      login: vi.fn(),
      signUp: vi.fn(),
      logout: vi.fn(),
      updateProfile: vi.fn(),
      updatePassword: vi.fn(),
      updateUserSettings: vi.fn(),
      updateUserLanguage: vi.fn(),
    };

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <I18nProvider>
          <TestSettingsConsumer />
        </I18nProvider>
      </AuthContext.Provider>
    );

    expect(screen.getByTestId('settings-title').textContent).toBe("Paramètres de l'application");
    expect(screen.getByTestId('appearance-title').textContent).toBe('Apparence');
    expect(document.documentElement.lang).toBe('fr-FR');
  });
});
