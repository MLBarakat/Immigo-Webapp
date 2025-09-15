import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { UserSettings, ThemeOption } from '../types/settings';
import { ApiClient } from '../services/apiClient';

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
  onSettingChange: (key: keyof UserSettings, value: any) => void; // Renamed from onSettingPreview
  pollyVoices: Voice[];
  isDesktop: boolean; // <-- ADDED
}

const THEME_OPTIONS: { value: ThemeOption; label: string }[] = [ { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, ];

export const ApplicationSettingsModal: React.FC<ApplicationSettingsModalProps> = ({ isOpen, onClose, settings, onSave, onSettingChange, pollyVoices = [], isDesktop }) => {
  const defaults: UserSettings = { theme: 'system', ai_voice_id: pollyVoices[0]?.id ?? 'Joanna', live_feedback_enabled: true, mic_mode: 'voice_activity', barge_in: 'balanced', progress_report_frequency: 'weekly', font_size: 'default' };
  const [draft, setDraft] = useState<UserSettings>({ ...defaults, ...settings });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setDraft({ ...defaults, ...settings }); } }, [isOpen, settings, defaults]); // Added defaults to dependency array

  // Propagate changes from internal draft state to the parent's onSettingChange
  const handleDraftChange = useCallback((key: keyof UserSettings, value: any) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    onSettingChange(key, value); // Also inform the parent component immediately
  }, [onSettingChange]);

  const handleSave = useCallback(async () => {
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

  const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; }> = ({ checked, onChange }) => (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`w-12 h-6 rounded-full p-1 flex items-center transition-colors ${checked ? 'bg-art-blue-600 justify-end' : 'bg-immigo-gray-300 justify-start'}`}>
      <div className="w-4 h-4 bg-white rounded-full shadow-md" />
    </button>
  );

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-60 flex ${isDesktop ? 'items-center justify-center' : 'items-start'} z-50 p-4`}>
      <div className={`bg-star-white rounded-2xl shadow-2xl w-full ${isDesktop ? 'max-w-2xl' : 'max-h-full h-full'} flex flex-col ${isDesktop ? 'max-h-[85vh] overflow-hidden' : ''}`}>
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200">
          <h2 className="text-2xl font-bold text-deep-navy font-display">Application Settings</h2>
          <button onClick={onClose} aria-label="Close settings" className="p-2 rounded-full hover:bg-immigo-gray-100">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>

        <main className="p-8 overflow-y-auto space-y-6 flex-1">
          <SettingRow title="Appearance" description="Choose how ImmiGo looks.">
            <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
              {THEME_OPTIONS.map(opt => (
                <button key={opt.value} role="radio" aria-checked={draft.theme === opt.value} onClick={() => handleDraftChange('theme', opt.value)}
                  className={`px-3 py-1 rounded-md capitalize text-sm ${draft.theme === opt.value ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </SettingRow>

          <hr className="border-immigo-gray-200" />

          <SettingRow title="AI Voice" description="Select the voice for your AI conversation partner.">
            <select value={draft.ai_voice_id} onChange={(e) => handleDraftChange('ai_voice_id', e.target.value)} className="bg-immigo-gray-100 border-2 border-immigo-gray-300 p-2 rounded-lg text-sm">
              {pollyVoices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </SettingRow>

          <hr className="border-immigo-gray-200" />

          <SettingRow title="Live Feedback" description="Get real-time tips during your conversation.">
            <Toggle checked={!!draft.live_feedback_enabled} onChange={(v) => handleDraftChange('live_feedback_enabled', v)} />
          </SettingRow>

          <hr className="border-immigo-gray-200" />

          <SettingRow title="Microphone Mode" description="Choose your speaking style.">
             <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
                <button role="radio" aria-checked={draft.mic_mode === 'voice_activity'} onClick={() => handleDraftChange('mic_mode', 'voice_activity')} className={`px-3 py-1 rounded-md text-sm ${draft.mic_mode === 'voice_activity' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Voice Activity</button>
                <button role="radio" aria-checked={draft.mic_mode === 'push_to_talk'} onClick={() => handleDraftChange('mic_mode', 'push_to_talk')} className={`px-3 py-1 rounded-md text-sm ${draft.mic_mode === 'push_to_talk' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Push-to-Talk</button>
            </div>
          </SettingRow>

          <hr className="border-immigo-gray-200" />

          <SettingRow title="Interruption Style" description="Adjust how easily you can speak over the AI.">
             <div role="radiogroup" className="flex items-center gap-2 p-1 bg-immigo-gray-200 rounded-lg">
                <button role="radio" aria-checked={draft.barge_in === 'relaxed'} onClick={() => handleDraftChange('barge_in', 'relaxed')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'relaxed' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Relaxed</button>
                <button role="radio" aria-checked={draft.barge_in === 'balanced'} onClick={() => handleDraftChange('barge_in', 'balanced')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'balanced' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Balanced</button>
                <button role="radio" aria-checked={draft.barge_in === 'aggressive'} onClick={() => handleDraftChange('barge_in', 'aggressive')} className={`px-3 py-1 rounded-md text-sm ${draft.barge_in === 'aggressive' ? 'bg-star-white shadow font-semibold' : 'hover:bg-immigo-gray-300'}`}>Aggressive</button>
            </div>
          </SettingRow>

          <hr className="border-immigo-gray-200" />

          <SettingRow title="Progress Reports" description="Customize your AI-generated progress summaries.">
            <select value={draft.progress_report_frequency} onChange={(e) => handleDraftChange('progress_report_frequency', e.target.value)}
              className="bg-immigo-gray-100 border-2 border-immigo-gray-300 p-2 rounded-lg text-sm">
              <option value="after_session">After Each Session</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </SettingRow>

          <hr className="border-immigo-gray-200" />

          <SettingRow title="Manage Subscription" description="View your current plan and explore premium features.">
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-art-blue-600 hover:bg-art-blue-50 rounded-lg">
                View Plans <ExternalLink className="w-4 h-4" />
            </button>
          </SettingRow>
        </main>

        <footer className="p-4 border-t border-immigo-gray-200 bg-immigo-gray-50 flex items-center justify-between flex-shrink-0">
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

const SettingRow: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <div className="flex items-center justify-between">
        <div>
            <h3 className="font-semibold text-deep-navy">{title}</h3>
            <p className="text-sm text-immigo-gray-600">{description}</p>
        </div>
        {children}
    </div>
);