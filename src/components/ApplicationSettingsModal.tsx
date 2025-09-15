import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { X, Info, Lock, Play } from 'lucide-react';
import type { UserSettings, ThemeOption } from '../types/settings';

interface Voice {
  id: string;
  name: string;
  premium?: boolean;
}

interface ApplicationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // draft initial settings (may be partial); we'll fill defaults locally
  settings: Partial<UserSettings>;
  // called when the user clicks Save (persist)
  onSave?: (settings: UserSettings) => Promise<void> | void;
  // optional immediate callback when a single setting changes (for preview)
  onSettingPreview?: (key: keyof UserSettings, value: any) => void;
  pollyVoices?: Voice[];
  initialFocusId?: string; // element id to focus when opened
  autoSave?: boolean; // if true call onSave on every change (debounced) instead of Save button
}

const THEME_OPTIONS: { value: ThemeOption; label: string; description: string }[] = [
  { value: 'system', label: 'System', description: "Match your device's theme" },
  { value: 'light', label: 'Light', description: 'Bright background and UI' },
  { value: 'dark', label: 'Dark', description: 'Dark background for low-light' },
];

export const ApplicationSettingsModal: React.FC<ApplicationSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  onSettingPreview,
  pollyVoices = [],
  initialFocusId,
  autoSave = false,
}) => {
  // Default values for missing settings
  const defaults: UserSettings = {
    theme: (settings.theme as ThemeOption) ?? 'system',
    ai_voice_id: settings.ai_voice_id ?? (pollyVoices[0]?.id ?? ''),
    live_feedback_enabled: settings.live_feedback_enabled ?? false,
    mic_mode: (settings.mic_mode as any) ?? 'voice_activity',
    barge_in: (settings.barge_in as any) ?? 'balanced',
    progress_report_frequency: (settings.progress_report_frequency as any) ?? 'weekly',
  };

  // Local draft state so user can Cancel
  const [draft, setDraft] = useState<UserSettings>(defaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus & restore
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Keep draft in sync when modal opens/closes or props change
  useEffect(() => {
    if (isOpen) {
      setDraft(prev => ({ ...defaults, ...prev })); // merge any partial previous
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, JSON.stringify(settings), pollyVoices.length]);

  // Focus management: focus first focusable element or provided id
  useEffect(() => {
    if (!isOpen) return;
    const focusId = initialFocusId;
    const timer = setTimeout(() => {
      if (focusId) {
        const el = document.getElementById(focusId) as HTMLElement | null;
        el?.focus();
      } else {
        // focus close button by default
        const closeBtn = dialogRef.current?.querySelector<HTMLButtonElement>('[data-close-button]');
        closeBtn?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, initialFocusId]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Simple focus trap (keeps focus inside modal)
  useEffect(() => {
    if (!isOpen) return;
    const handleFocus = (e: FocusEvent) => {
      if (!dialogRef.current) return;
      if (!dialogRef.current.contains(e.target as Node)) {
        e.stopPropagation();
        const first = dialogRef.current.querySelector<HTMLElement>('button, [href], input, select, textarea');
        first?.focus();
      }
    };
    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, [isOpen]);

  const safeUpdate = useCallback(
    (key: keyof UserSettings, value: any) => {
      setDraft(prev => {
        const next = { ...prev, [key]: value } as UserSettings;
        // preview hook (immediate) - optional
        onSettingPreview?.(key, value);
        return next;
      });
    },
    [onSettingPreview]
  );

  // Simple debounced autosave (if autoSave true)
  useEffect(() => {
    if (!autoSave) return;
    const id = setTimeout(async () => {
      if (!onSave) return;
      try {
        setSaving(true);
        await onSave(draft);
        setError(null);
      } catch (err: any) {
        setError(err?.message ?? 'Save failed');
      } finally {
        setSaving(false);
      }
    }, 600);
    return () => clearTimeout(id);
  }, [autoSave, draft, onSave]);

  const handleSave = useCallback(async () => {
    if (!onSave) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setError(null);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, onClose]);

  const handleCancel = useCallback(() => {
    setDraft(defaults);
    onClose();
  }, [defaults, onClose]);

  // Safe voice list mapping
  const voiceOptions = useMemo(() => pollyVoices ?? [], [pollyVoices]);

  // helper render for toggle (uses checkbox for accessibility)
  const Toggle: React.FC<{ id: string; checked: boolean; onChange: (v: boolean) => void; label?: string; title?: string; }> = ({ id, checked, onChange, label, title }) => (
    <label htmlFor={id} className="inline-flex items-center space-x-3 cursor-pointer">
      <span className="sr-only">{label ?? 'Toggle'}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="sr-only"
        aria-label={title ?? label}
      />
      <div className={`w-12 h-6 rounded-full p-1 flex items-center transition-colors ${checked ? 'bg-art-blue-600 justify-end' : 'bg-immigo-gray-300 justify-start'}`}>
        <div className="w-4 h-4 bg-white rounded-full shadow-md" />
      </div>
    </label>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" aria-hidden={!isOpen}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        className="bg-star-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden"
      >
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200">
          <div>
            <h2 id="app-settings-title" className="text-2xl font-bold text-deep-navy font-display">Application Settings</h2>
            <p className="text-sm text-immigo-gray-600 mt-1">Personalize ImmiGo to match how you learn and practice.</p>
          </div>
          <div className="flex items-center space-x-3">
            <button data-close-button onClick={onClose} aria-label="Close settings" className="p-2 rounded-full hover:bg-immigo-gray-100">
              <X className="w-6 h-6 text-immigo-gray-600" />
            </button>
          </div>
        </header>

        {/* body */}
        <main className="p-6 overflow-auto space-y-6">
          {/* Appearance (Theme) */}
          <section aria-labelledby="appearance-heading" className="flex items-center justify-between">
            <div>
              <h3 id="appearance-heading" className="font-semibold text-deep-navy">Appearance</h3>
              <p className="text-sm text-immigo-gray-600">Choose how ImmiGo looks. Select light, dark, or match your device.</p>
            </div>

            <div role="radiogroup" aria-label="Appearance options" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
              {THEME_OPTIONS.map(opt => {
                const selected = draft.theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => safeUpdate('theme', opt.value)}
                    className={`px-3 py-1 rounded-md capitalize text-sm focus:outline-none ${selected ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          <hr className="border-immigo-gray-200" />

          {/* AI Voice */}
          <section aria-labelledby="ai-voice-heading" className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 id="ai-voice-heading" className="font-semibold text-deep-navy">AI Voice</h3>
                <button title="Preview voices" type="button" className="text-immigo-gray-400 p-1 rounded hover:bg-immigo-gray-100">
                  <Info className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-immigo-gray-600">Select the voice for your AI conversation partner.</p>
            </div>

            <div className="flex items-center space-x-3">
              <select
                id="ai-voice-select"
                value={draft.ai_voice_id ?? ''}
                onChange={(e) => safeUpdate('ai_voice_id', e.target.value)}
                className="bg-immigo-gray-100 border-2 border-immigo-gray-300 p-2 rounded-lg text-sm"
              >
                {voiceOptions.length === 0 && <option value="">No voices available</option>}
                {voiceOptions.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.premium ? ' (Premium)' : ''}
                  </option>
                ))}
              </select>

              {/* preview button */}
              <button
                onClick={() => {
                  // preview callback - you could call a player
                  onSettingPreview?.('ai_voice_id', draft.ai_voice_id);
                }}
                className="px-3 py-2 bg-art-blue-600 text-white rounded-md text-sm flex items-center gap-2"
                aria-label="Preview selected voice"
              >
                <Play className="w-4 h-4" />
                Preview
              </button>
            </div>
          </section>

          <hr className="border-immigo-gray-200" />

          {/* Live Feedback */}
          <section aria-labelledby="live-feedback-heading" className="flex items-center justify-between">
            <div>
              <h3 id="live-feedback-heading" className="font-semibold text-deep-navy">Live Feedback</h3>
              <p className="text-sm text-immigo-gray-600">Get real-time tips during your conversation (filler words, pace).</p>
            </div>
            <Toggle
              id="live-feedback-toggle"
              checked={!!draft.live_feedback_enabled}
              onChange={(v) => safeUpdate('live_feedback_enabled', v)}
              title="Enable Live Feedback"
            />
          </section>

          <hr className="border-immigo-gray-200" />

          {/* Additional sections: Mic Mode, Barge-in Sensitivity, Billing & Subscription, Progress Reports */}
          {/* For brevity, implement similarly with accessible inputs and short descriptions. */}
        </main>

        {/* footer */}
        <footer className="p-4 border-t border-immigo-gray-200 bg-star-white flex items-center justify-between">
          <div className="text-sm text-art-red-600">{error && <span>{error}</span>}</div>

          <div className="flex items-center gap-3">
            <button onClick={handleCancel} className="px-4 py-2 rounded-md hover:bg-immigo-gray-100">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-art-blue-600 text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
