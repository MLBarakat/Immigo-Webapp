import React from 'react';
import { X, Trash2, Download } from 'lucide-react';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  voiceId: string;
  onVoiceChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  pollyVoices: Array<{ id: string; name: string }>;
  onClearConversation: () => void;
  onDownloadTranscript: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  voiceId,
  onVoiceChange,
  pollyVoices,
  onClearConversation,
  onDownloadTranscript,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-end z-50 lg:hidden" onClick={onClose}>
      <div
        className="w-80 bg-star-white h-full shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold text-deep-navy">Menu</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-immigo-gray-100">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-immigo-gray-700 mb-2">AI Voice</label>
            <select
              value={voiceId}
              onChange={onVoiceChange}
              className="w-full bg-immigo-gray-100 border-2 border-immigo-gray-300 p-2 rounded-lg text-sm focus:ring-art-blue-500 focus:border-art-blue-500"
            >
              {pollyVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>{voice.name}</option>
              ))}
            </select>
          </div>

          <div>
             <h3 className="font-bold text-lg text-deep-navy mb-2">Session Tools</h3>
             <div className="space-y-2">
                <button onClick={onClearConversation} className="w-full flex items-center p-3 rounded-lg hover:bg-immigo-gray-100 text-left">
                    <Trash2 className="w-5 h-5 text-immigo-gray-600 mr-3" /> Clear Conversation
                </button>
                <button onClick={onDownloadTranscript} className="w-full flex items-center p-3 rounded-lg hover:bg-immigo-gray-100 text-left">
                    <Download className="w-5 h-5 text-immigo-gray-600 mr-3" /> Download Transcript
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};