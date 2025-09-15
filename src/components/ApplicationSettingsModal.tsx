import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { X, Info, Play, ExternalLink } from 'lucide-react';
import type { UserSettings, ThemeOption, MicMode, BargeIn, ProgressReportFrequency } from '../types/settings';

interface Voice {
  id: string;
  name: string;
  premium?: boolean;
}

interface ApplicationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Partial<UserSettings>;
  onSave?: (settings: UserSettings) => Promise<void> | void;
  onSettingPreview?: (key: keyof UserSettings, value: any) => void;
  pollyVoices?: Voice[];
  initialFocusId?: string;
  autoSave?: boolean;
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
  const defaults: UserSettings = {
    theme: 'system',
    ai_voice_id: pollyVoices[0]?.id ?? 'Joanna',
    live_feedback_enabled: true,
    mic_mode: 'voice_activity',
    barge_in: 'balanced',
    progress_report_frequency: 'weekly',
    font_size: 'default'
  };

  const [draft, setDraft] = useState<UserSettings>({ ...defaults, ...settings });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft({ ...defaults, ...settings });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, JSON.stringify(settings)]);

  const safeUpdate = useCallback(
    (key: keyof UserSettings, value: any) => {
      setDraft(prev => {
        const next = { ...prev, [key]: value } as UserSettings;
        onSettingPreview?.(key, value);
        return next;
      });
    },
    [onSettingPreview]
  );

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

  const Toggle: React.FC<{ id: string; checked: boolean; onChange: (v: boolean) => void; }> = ({ id, checked, onChange }) => (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-12 h-6 rounded-full p-1 flex items-center transition-colors ${checked ? 'bg-art-blue-600 justify-end' : 'bg-immigo-gray-300 justify-start'}`}
    >
      <span className="sr-only">{checked ? 'Disable' : 'Enable'}</span>
      <div className="w-4 h-4 bg-white rounded-full shadow-md" />
    </button>
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
          <h2 id="app-settings-title" className="text-2xl font-bold text-deep-navy font-display">Application Settings</h2>
          <button data-close-button onClick={onClose} aria-label="Close settings" className="p-2 rounded-full hover:bg-immigo-gray-100">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>

        <main className="p-8 overflow-y-auto space-y-6">
          {/* Appearance */}
          <section className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-deep-navy">Appearance</h3>
              <p className="text-sm text-immigo-gray-600">Choose how ImmiGo looks. Select light, dark, or match your device.</p>
            </div>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
              {THEME_OPTIONS.map(opt => (
                <button key={opt.value} role="radio" aria-checked={draft.theme === opt.value} onClick={() => safeUpdate('theme', opt.value)}
                  className={`px-3 py-1 rounded-md capitalize text-sm ${draft.theme === opt.value ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <hr className="border-immigo-gray-200" />

          {/* AI Voice */}
          <section className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-deep-navy">AI Voice</h3>
              <p className="text-sm text-immigo-gray-600">Select the voice for your AI conversation partner.</p>
            </div>
            <select id="ai-voice-select" value={draft.ai_voice_id ?? ''} onChange={(e) => safeUpdate('ai_voice_id', e.target.value)} className="bg-immigo-gray-100 border-2 border-immigo-gray-300 p-2 rounded-lg text-sm">
              {pollyVoices.map(v => <option key={v.id} value={v.id}>{v.name}{v.premium ? ' (Premium)' : ''}</option>)}
            </select>
          </section>

          <hr className="border-immigo-gray-200" />

          {/* Live Feedback */}
          <section className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-deep-navy">Live Feedback</h3>
              <p className="text-sm text-immigo-gray-600">Get real-time tips during your conversation.</p>
            </div>
            <Toggle id="live-feedback-toggle" checked={!!draft.live_feedback_enabled} onChange={(v) => safeUpdate('live_feedback_enabled', v)} />
          </section>

          <hr className="border-immigo-gray-200" />

          {/* Microphone Mode */}
          <section className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-deep-navy">Microphone Mode</h3>
              <p className="text-sm text-immigo-gray-600">Choose your speaking style.</p>
            </div>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
                <button role="radio" aria-checked={draft.mic_mode === 'voice_activity'} onClick={() => safeUpdate('mic_mode', 'voice_activity')} className={`px-3 py-1 rounded-md text-sm ${draft.mic_mode === 'voice_activity' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Voice Activity</button>
                <button role="radio" aria-checked={draft.mic_mode === 'push_to_talk'} onClick={() => safeUpdate('mic_mode', 'push_to_talk')} className={`px-3 py-1 rounded-md text-sm ${draft.mic_mode === 'push_to_talk' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Push-to-Talk</button>
            </div>
          </section>

          <hr className="border-immigo-gray-200" />

          {/* Interruption Style */}
          <section className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-deep-navy">Interruption Style</h3>
              <p className="text-sm text-immigo-gray-600">Adjust how easily you can speak over the AI.</p>
            </div>
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
                <button role="radio" aria-checked={draft.barge_in === 'relaxed'} onClick={() => safeUpdate('barge_in', 'relaxed')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'relaxed' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Relaxed</button>
                <button role="radio" aria-checked={draft.barge_in === 'balanced'} onClick={() => safeUpdate('barge_in', 'balanced')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'balanced' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Balanced</button>
                <button role="radio" aria-checked={draft.barge_in === 'aggressive'} onClick={() => safeUpdate('barge_in', 'aggressive')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'aggressive' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Aggressive</button>
            </div>
          </section>

          <hr className="border-immigo-gray-200" />

          {/* Progress Reports */}
          <section className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-deep-navy">Progress Reports</h3>
              <p className="text-sm text-immigo-gray-600">Customize your AI-generated progress summaries.</p>
            </div>
            <select value={draft.progress_report_frequency} onChange={(e) => safeUpdate('progress_report_frequency', e.target.value)}
              className="bg-immigo-gray-100 border-2 border-immigo-gray-300 p-2 rounded-lg text-sm">
              <option value="after_session">After Each Session</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </section>

          <hr className="border-immigo-gray-200" />

          {/* Manage Subscription */}
          <section className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-deep-navy">Manage Subscription</h3>
              <p className="text-sm text-immigo-gray-600">View your current plan and explore premium features.</p>
            </div>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-art-blue-600 hover:bg-art-blue-50 rounded-lg">
                View Plans <ExternalLink className="w-4 h-4" />
            </button>
          </section>
        </main>

        <footer className="p-4 border-t border-immigo-gray-200 bg-immigo-gray-50 flex items-center justify-between">
          <div className="text-sm text-art-red-600 h-5">{error && <span>{error}</span>}</div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-md hover:bg-immigo-gray-200 font-semibold">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-md bg-art-blue-600 text-white font-semibold disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};