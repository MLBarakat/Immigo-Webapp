import React from 'react';
import { X } from 'lucide-react';
import { UserSettings } from '../types/settings';

interface ApplicationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Partial<UserSettings>;
  onSettingChange: (key: keyof UserSettings, value: any) => void;
  pollyVoices: Array<{ id: string; name: string }>;
}

export const ApplicationSettingsModal: React.FC<ApplicationSettingsModalProps> = ({ isOpen, onClose, settings, onSettingChange, pollyVoices }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200">
          <h2 className="text-2xl font-bold text-deep-navy font-display">Application Settings</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-immigo-gray-100">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>
        <main className="p-8 space-y-6 overflow-y-auto">
          {/* Appearance */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-deep-navy">Appearance</h3>
              <p className="text-sm text-immigo-gray-600">Choose how ImmiGo looks.</p>
            </div>
            <div className="p-1 bg-immigo-gray-200 rounded-lg flex space-x-1 text-sm">
              {['system', 'light', 'dark'].map((theme) => (
                <button key={theme} onClick={() => onSettingChange('theme', theme)} className={`px-3 py-1 rounded-md capitalize ${settings.theme === theme ? 'bg-star-white shadow' : ''}`}>
                  {theme}
                </button>
              ))}
            </div>
          </div>
          <hr className="border-immigo-gray-200" />
          {/* AI Voice */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-deep-navy">AI Voice</h3>
              <p className="text-sm text-immigo-gray-600">Select the voice for your AI conversation partner.</p>
            </div>
            <select value={settings.ai_voice_id || 'Joanna'} onChange={(e) => onSettingChange('ai_voice_id', e.target.value)} className="bg-immigo-gray-100 border-2 border-immigo-gray-300 p-2 rounded-lg text-sm">
              {pollyVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
            </select>
          </div>
          <hr className="border-immigo-gray-200" />
          {/* Live Feedback */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-deep-navy">Live Feedback</h3>
              <p className="text-sm text-immigo-gray-600">Get real-time tips during your conversation.</p>
            </div>
            <button onClick={() => onSettingChange('live_feedback_enabled', !settings.live_feedback_enabled)} className={`w-12 h-6 rounded-full p-1 flex items-center transition-colors ${settings.live_feedback_enabled ? 'bg-art-blue-600 justify-end' : 'bg-immigo-gray-300 justify-start'}`}>
                <div className="w-4 h-4 bg-white rounded-full shadow-md transform transition-transform"></div>
            </button>
          </div>
          {/* ... Other settings implemented similarly ... */}
        </main>
      </div>
    </div>
  );
};