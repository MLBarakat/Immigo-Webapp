import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { DEFAULT_USER_SETTINGS, type UserSettings, type ThemeOption } from '../types/settings';
import { applyFontSize, FONT_SIZES, FONT_SIZE_LABELS, normalizeFontSize, type CanonicalFontSize } from '../utils/fontSize';
import { applyTheme, normalizeTheme } from '../utils/theme';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useDraggableOverlay } from '../hooks/useDraggableOverlay';
import { getDefaultVoiceId, getVoiceById, getVoicesForLocale, normalizeVoiceId } from '../constants/voices';
import { LanguageSelector } from './LanguageSelector';
import { AudioDeviceSettings } from './AudioDeviceSettings';

interface ApplicationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Partial<UserSettings>;
  onSave: (settings: UserSettings) => Promise<void>;
  onVoicePreview?: (voiceId: string, language: string, voiceName: string) => void;
  isDesktop: boolean;
  /** Disables live microphone testing while the AI voice session owns the mic. */
  isSessionActive?: boolean;
}

const THEME_OPTION_VALUES: ThemeOption[] = ['light', 'dark'];

const FONT_SIZE_NAME_KEYS: Record<CanonicalFontSize, string> = {
  'extra-small': 'font.extraSmall',
  'small': 'font.small',
  'default': 'font.medium',
  'large': 'font.large',
  'extra-large': 'font.extraLarge',
};

function buildDraft(settings: Partial<UserSettings>): UserSettings {
  const language = settings.language || DEFAULT_USER_SETTINGS.language;
  return {
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    language,
    theme: normalizeTheme(settings.theme ?? DEFAULT_USER_SETTINGS.theme),
    ai_voice_id: normalizeVoiceId(
      settings.ai_voice_id ?? getDefaultVoiceId(language),
      language,
    ),
  };
}

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

export const ApplicationSettingsModal: React.FC<ApplicationSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  onVoicePreview,
  isDesktop,
  isSessionActive = false,
}) => {
  const { t, i18n } = useTranslation('settings');
  const isArabic = i18n.language === 'ar-SA';
  const [draft, setDraft] = useState<UserSettings>(() => buildDraft(settings));
  const draftRef = useRef(draft);
  const wasOpenRef = useRef(isOpen);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useFocusTrap(isOpen);
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableOverlay<HTMLDivElement>(modalRef);

  // Rebuild the editable snapshot only when the modal opens. In-flight
  // auto-saves update `settings`, and syncing on every prop change would
  // briefly revert a newer choice to an older completed write.
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const next = buildDraft(settings);
      draftRef.current = next;
      setDraft(next);
      setError(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, settings]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const enqueueSave = useCallback((next: UserSettings) => {
    const accountSettings: UserSettings = { ...next };
    delete accountSettings.learning_goal;
    delete accountSettings.weekly_graded_answer_target;

    pendingSavesRef.current += 1;
    setSaving(true);
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => onSave(accountSettings))
      .then(() => {
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('saveFailed'));
      })
      .finally(() => {
        pendingSavesRef.current -= 1;
        if (pendingSavesRef.current === 0) setSaving(false);
      });
  }, [onSave, t]);

  const applyChanges = useCallback((changes: Partial<UserSettings>) => {
    const next: UserSettings = { ...draftRef.current, ...changes };
    draftRef.current = next;
    setDraft(next);

    if (changes.theme) applyTheme(next.theme);
    if (changes.font_size) applyFontSize(next.font_size);

    enqueueSave(next);
  }, [enqueueSave]);

  const handleLanguageChange = useCallback((language: string) => {
    applyChanges({ language, ai_voice_id: getDefaultVoiceId(language) });
  }, [applyChanges]);

  const handleVoiceChange = useCallback((voiceId: string) => {
    const language = draftRef.current.language;
    const previousVoiceId = normalizeVoiceId(draftRef.current.ai_voice_id, language);
    applyChanges({ ai_voice_id: voiceId });

    if (voiceId !== previousVoiceId) {
      const voice = getVoiceById(voiceId);
      onVoicePreview?.(voiceId, language, voice?.name ?? voiceId);
    }
  }, [applyChanges, onVoicePreview]);

  if (!isOpen) return null;

  const availableVoices = getVoicesForLocale(draft.language);

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-60 flex ${isDesktop ? 'items-center justify-center' : 'items-start'} z-50 p-4`}>
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="application-settings-title" dir={isArabic ? 'rtl' : 'ltr'} className={`bg-star-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${isDesktop ? 'max-w-2xl' : 'max-h-full h-full'} flex flex-col ${isDesktop ? 'max-h-[85vh] overflow-hidden' : ''} outline-none`}>
        <header
          onPointerDown={isDesktop ? handlePointerDown : undefined}
          onPointerMove={isDesktop ? handlePointerMove : undefined}
          onPointerUp={isDesktop ? handlePointerUp : undefined}
          onPointerCancel={isDesktop ? handlePointerUp : undefined}
          className={`flex items-start justify-between gap-4 p-6 border-b border-immigo-gray-200 dark:border-gray-700 ${isDesktop ? 'cursor-grab active:cursor-grabbing touch-none select-none' : ''}`}
        >
          <div className="min-w-0">
            <h2 id="application-settings-title" className="text-2xl font-bold text-deep-navy dark:text-gray-100 font-display">{t('title')}</h2>
            <div className="min-h-5 text-sm" aria-live="polite">
              {error ? <span role="alert" className="text-art-red-600">{error}</span> : null}
              {!error && saving ? <span role="status" className="text-immigo-gray-500">{t('saving')}</span> : null}
            </div>
          </div>
          <button onClick={handleClose} aria-label={t('close')} className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700">
            <X className="w-6 h-6 text-immigo-gray-600 dark:text-gray-300" />
          </button>
        </header>

        <main className="p-8 overflow-y-auto space-y-6 flex-1">
          <SettingRow title={t('appearance.title')} description={t('appearance.description')}>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 dark:bg-gray-700 rounded-lg">
              {THEME_OPTION_VALUES.map(opt => (
                <button key={opt} role="radio" aria-checked={draft.theme === opt} onClick={() => applyChanges({ theme: opt })}
                  className={`px-3 py-1 rounded-md capitalize text-sm ${draft.theme === opt ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300 dark:hover:bg-gray-600'}`}>
                  {t(`theme.${opt}`)}
                </button>
              ))}
            </div>
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          {!isDesktop && (
            <>
              <hr className="border-immigo-gray-200 dark:border-gray-700" />
              <SettingRow title={t('language.title')} description={t('language.description')}>
                <LanguageSelector
                  currentLanguageCode={draft.language}
                  onLanguageChange={handleLanguageChange}
                />
              </SettingRow>

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
                        onClick={() => applyChanges({ font_size: size })}
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
            <select
              aria-label={t('voice.title')}
              value={draft.ai_voice_id}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="bg-immigo-gray-100 dark:bg-gray-700 dark:text-gray-100 border-2 border-immigo-gray-300 dark:border-gray-600 p-2 rounded-lg text-sm"
            >
              {availableVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>{voice.displayName}</option>
              ))}
            </select>
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('feedback.title')} description={t('feedback.description')}>
            <Toggle ariaLabel={t('feedback.toggle')} checked={!!draft.live_feedback_enabled} onChange={(v: boolean) => applyChanges({ live_feedback_enabled: v })} />
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('mic.title')} description={t('mic.description')}>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
              <button role="radio" aria-checked={draft.mic_mode === 'voice_activity'} onClick={() => applyChanges({ mic_mode: 'voice_activity' })} className={`px-3 py-1 rounded-md text-sm ${draft.mic_mode === 'voice_activity' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('mic.voiceActivity')}</button>
              <button role="radio" aria-checked={draft.mic_mode === 'push_to_talk'} onClick={() => applyChanges({ mic_mode: 'push_to_talk' })} className={`px-3 py-1 rounded-md text-sm ${draft.mic_mode === 'push_to_talk' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('mic.pushToTalk')}</button>
            </div>
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-deep-navy dark:text-gray-100">{t('audio.title')}</h3>
              <p className="text-sm text-immigo-gray-600 dark:text-gray-300">{t('audio.description')}</p>
            </div>
            <AudioDeviceSettings
              inputDeviceId={draft.input_device_id}
              outputDeviceId={draft.output_device_id}
              isSessionActive={isSessionActive}
              onInputDeviceChange={(deviceId) => applyChanges({ input_device_id: deviceId })}
              onOutputDeviceChange={(deviceId) => applyChanges({ output_device_id: deviceId })}
            />
          </div>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('bargeIn.title')} description={t('bargeIn.description')}>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
              <button role="radio" aria-checked={draft.barge_in === 'relaxed'} onClick={() => applyChanges({ barge_in: 'relaxed' })} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'relaxed' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('bargeIn.relaxed')}</button>
              <button role="radio" aria-checked={draft.barge_in === 'balanced'} onClick={() => applyChanges({ barge_in: 'balanced' })} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'balanced' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('bargeIn.balanced')}</button>
              <button role="radio" aria-checked={draft.barge_in === 'aggressive'} onClick={() => applyChanges({ barge_in: 'aggressive' })} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'aggressive' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>{t('bargeIn.aggressive')}</button>
            </div>
          </SettingRow>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          <SettingRow title={t('progress.title')} description={t('progress.description')}>
            <select
              aria-label={t('progress.title')}
              value={draft.progress_report_frequency}
              onChange={(e) => applyChanges({ progress_report_frequency: e.target.value as UserSettings['progress_report_frequency'] })}
              className="bg-immigo-gray-100 dark:bg-gray-700 dark:text-gray-100 border-2 border-immigo-gray-300 dark:border-gray-600 p-2 rounded-lg text-sm"
            >
              <option value="after_session">{t('progress.afterSession')}</option>
              <option value="daily">{t('progress.daily')}</option>
              <option value="weekly">{t('progress.weekly')}</option>
              <option value="monthly">{t('progress.monthly')}</option>
            </select>
          </SettingRow>

          {isDesktop && (
            <>
              <hr className="border-immigo-gray-200 dark:border-gray-700" />

              <SettingRow title={t('subscription.title')} description={t('subscription.description')}>
                <span className="text-sm text-immigo-gray-500">{t('subscription.unavailable')}</span>
              </SettingRow>
            </>
          )}
        </main>
      </div>
    </div>
  );
};
