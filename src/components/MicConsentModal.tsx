import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, X } from 'lucide-react';

interface MicConsentModalProps {
  onAccept: () => void;
  onCancel: () => void;
}

export const MicConsentModal: React.FC<MicConsentModalProps> = ({ onAccept, onCancel }) => {
  const { t } = useTranslation('conversation');
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col transform transition-all duration-300 scale-95 animate-scale-in">
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-art-blue-50">
              <Mic className="w-5 h-5 text-art-blue-600" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-deep-navy font-display">{t('workspace.voice.consentTitle')}</h2>
          </div>
          <button onClick={onCancel} aria-label={t('workspace.voice.cancel')} className="p-2 rounded-full hover:bg-immigo-gray-100 transition-colors">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>

        <main className="p-6 text-sm text-immigo-gray-700 leading-relaxed space-y-3">
          <p>
            {t('workspace.voice.consentDescription')} <strong>{t('workspace.voice.consentOnDevice')}</strong>, and only the resulting text is sent to us.
          </p>
          <p>
            <strong>{t('workspace.voice.consentAudioPrivacy')}</strong>
            {' '}{t('workspace.voice.consentPrivacyDetails')}
          </p>
        </main>

        <footer className="p-6 border-t border-immigo-gray-200 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-5 py-2 bg-immigo-gray-100 text-immigo-gray-700 font-semibold rounded-lg hover:bg-immigo-gray-200 transition-colors"
          >
            {t('workspace.voice.cancel')}
          </button>
          <button
            onClick={onAccept}
            className="px-5 py-2 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500 transition-transform transform hover:scale-105"
          >
            {t('workspace.voice.consentAccept')}
          </button>
        </footer>
      </div>
    </div>
  );
};
