import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { UserSettings, ThemeOption } from '../types/settings';
import { FONT_SIZES, FONT_SIZE_LABELS, normalizeFontSize, type CanonicalFontSize } from '../utils/fontSize';
import { applyTheme, normalizeTheme } from '../utils/theme';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Voice {
  id: string;
  name: string;
  premium?: boolean;
}

interface ApplicationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Partial<UserSettings>;
  onSave: (settings: UserSettings) => Promise<void>;
  onThemePreview: (theme: ThemeOption | null) => void;
  pollyVoices: Voice[];
  isDesktop: boolean;
}

const THEME_OPTION_VALUES: ThemeOption[] = ['light', 'dark'];

const FONT_SIZE_NAME_KEYS: Record<CanonicalFontSize, string> = {
  'extra-small': 'font.extraSmall',
  'small': 'font.small',
  'default': 'font.medium',
  'large': 'font.large',
  'extra-large': 'font.extraLarge',
};

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; ariaLabel: string }> = ({ checked, onChange, ariaLabel }) => (
  <button role="switch" aria-checked={checked} aria-label={ariaLabel} onClick={() => onChange(!checked)}
    className={`w-12 h-6 rounded-full p-1 flex items-center transition-colors ${checked ? 'bg-art-blue-600 justify-end' : 'bg-immigo-gray-300 justify-start'}`}>
    <div className="w-4 h-4 bg-white rounded-full shadow-md" />
  </button>
);

const SettingRow: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="flex items-center justify-between">
    <div>
      <h3 className="font-semibold text-deep-navy dark:text-gray-100">{title}</h3>
      <p className="text-sm text-immigo-gray-600 dark:text-gray-300">{description}</p>
    </div>
    {children}
  </div>
);

export const ApplicationSettingsModal: React.FC<ApplicationSettingsModalProps> = ({ isOpen, onClose, settings, onSave, onThemePreview, pollyVoices = [], isDesktop }) => {
  const { t } = useTranslation('settings');
  const defaults = useMemo((): UserSettings => ({ language: 'en-US', theme: 'light', ai_voice_id: pollyVoices[0]?.id ?? 'Joanna', live_feedback_enabled: true, mic_mode: 'voice_activity', barge_in: 'balanced', progress_report_frequency: 'weekly', font_size: 'default', has_seen_welcome: false }), [pollyVoices]);
  const [draft, setDraft] = useState<UserSettings>({ ...defaults, ...settings, theme: normalizeTheme(settings.theme ?? defaults.theme) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useFocusTrap(isOpen);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isOpen) { setDraft({ ...defaults, ...settings, theme: normalizeTheme(settings.theme ?? defaults.theme) }); } }, [isOpen, settings, defaults]);

  const handleClose = useCallback(() => {
    applyTheme(normalizeTheme(settings.theme ?? defaults.theme));
    onThemePreview(null);
    onClose();
  }, [defaults.theme, onClose, onThemePreview, settings.theme]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const handleDraftChange = useCallback((key: keyof UserSettings, value: UserSettings[keyof UserSettings]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setError(null);
      onThemePreview(null);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, onClose, onThemePreview, t]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-60 flex ${isDesktop ? 'items-center justify-center' : 'items-start'} z-50 p-4`}>
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="application-settings-title" className={`bg-star-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${isDesktop ? 'max-w-2xl' : 'max-h-full h-full'} flex flex-col ${isDesktop ? 'max-h-[85vh] overflow-hidden' : ''} outline-none`}>
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200 dark:border-gray-700">
          <h2 id="application-settings-title" className="text-2xl font-bold text-deep-navy dark:text-gray-100 font-display">{t('title')}</h2>
          <button onClick={handleClose} aria-label={t('close')} className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700">
            <X className="w-6 h-6 text-immigo-gray-600 dark:text-gray-300" />
          </button>
        </header>

        <main className="p-8 overflow-y-auto space-y-6 flex-1">
          <SettingRow title={t('appearance.title')} description={t('appearance.description')}>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 dark:bg-gray-700 rounded-lg">
              {THEME_OPTION_VALUES.map(opt => (
                <button key={opt} role="radio" aria-checked={draft.theme === opt} onClick={() => {
                  handleDraftChange('theme', opt);
                  applyTheme(opt);
                  onThemePreview(opt);
                }}
                  className={`px-3 py-1 rounded-md capitalize text-sm ${draft.theme === opt ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300 dark:hover:bg-gray-600'}`}>
                  {t(`theme.${opt}`)}
                </button>
              ))}
            </div>
          </SettingRow>

          {!isDesktop && (
            <>
              <hr className="border-immigo-gray-200 dark:border-gray-700" />
              <SettingRow title={t('font.title')} description={t('font.description')}>
                <div role="radiogroup" aria-label={t('font.title')} className="flex items-center gap-1 p-1 bg-immigo-gray-200 dark:bg-gray-700 rounded-lg">
                  {FONT_SIZES.map(size => {
                    const isActive = normalizeFontSize(draft.font_size) === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => handleDraftChange('font_size', size)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase transition-colors ${isActive ? 'bg-star-white shadow text-deep-navy font-bold' : 'text-immigo-gray-700 dark:text-gray-300 hover:bg-immigo-gray-300 dark:hover:bg-gray-600'
                          }`}
                        title={t(FONT_SIZE_NAME_KEYS[size])}
                        aria-label={t(FONT_SIZE_NAME_KEYS[size])}
                      >
                        {FONT_SIZE_LABELS[size]}
                      </button>
                    );
                  })}
                </div>
              </SettingRow>
            </>
          )}

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('voice.title')} description={t('voice.description')}>
            <select value={draft.ai_voice_id} onChange={(e) => handleDraftChange('ai_voice_id', e.target.value)} className="bg-immigo-gray-100 dark:bg-gray-700 dark:text-gray-100 border-2 border-immigo-gray-300 dark:border-gray-600 p-2 rounded-lg text-sm">
              {pollyVoices.map((v: Voice) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('feedback.title')} description={t('feedback.description')}>
            <Toggle ariaLabel={t('feedback.toggle')} checked={!!draft.live_feedback_enabled} onChange={(v: boolean) => handleDraftChange('live_feedback_enabled', v)} />
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('mic.title')} description={t('mic.description')}>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
              <button role="radio" aria-checked={draft.mic_mode === 'voice_activity'} onClick={() => handleDraftChange('mic_mode', 'voice_activity')} className={`px-3 py-1 rounded-md text-sm ${draft.mic_mode === 'voice_activity' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('mic.voiceActivity')}</button>
              <button role="radio" aria-checked={draft.mic_mode === 'push_to_talk'} onClick={() => handleDraftChange('mic_mode', 'push_to_talk')} className={`px-3 py-1 rounded-md text-sm ${draft.mic_mode === 'push_to_talk' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('mic.pushToTalk')}</button>
            </div>
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('bargeIn.title')} description={t('bargeIn.description')}>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
              <button role="radio" aria-checked={draft.barge_in === 'relaxed'} onClick={() => handleDraftChange('barge_in', 'relaxed')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'relaxed' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('bargeIn.relaxed')}</button>
              <button role="radio" aria-checked={draft.barge_in === 'balanced'} onClick={() => handleDraftChange('barge_in', 'balanced')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'balanced' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('bargeIn.balanced')}</button>
              <button role="radio" aria-checked={draft.barge_in === 'aggressive'} onClick={() => handleDraftChange('barge_in', 'aggressive')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'aggressive' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('bargeIn.aggressive')}</button>
            </div>
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('progress.title')} description={t('progress.description')}>
            <select value={draft.progress_report_frequency} onChange={(e) => handleDraftChange('progress_report_frequency', e.target.value)}
              className="bg-immigo-gray-100 border-2 border-immigo-gray-300 p-2 rounded-lg text-sm">
              <option value="after_session">{t('progress.afterSession')}</option>
              <option value="daily">{t('progress.daily')}</option>
              <option value="weekly">{t('progress.weekly')}</option>
              <option value="monthly">{t('progress.monthly')}</option>
            </select>
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('subscription.title')} description={t('subscription.description')}>
            <span className="text-sm text-immigo-gray-500">{t('subscription.unavailable')}</span>
          </SettingRow>
        </main>

        <footer className="p-4 border-t border-immigo-gray-200 dark:border-gray-700 bg-immigo-gray-50 dark:bg-gray-900 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-art-red-600 h-5">{error && <span>{error}</span>}</div>
          <div className="flex items-center gap-3">
            <button onClick={handleClose} className="px-4 py-2 rounded-md hover:bg-immigo-gray-200 dark:hover:bg-gray-700 dark:text-gray-100 font-semibold">{t('cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-md bg-art-blue-600 text-white font-semibold disabled:opacity-60">
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
