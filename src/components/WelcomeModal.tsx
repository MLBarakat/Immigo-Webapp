import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hand, Mic, MessageSquare, Zap, ArrowRight, X } from 'lucide-react';

interface WelcomeModalProps {
  userName: string;
  onClose: () => void;
}

const STEP_KEYS = ['start', 'speak', 'interrupt'] as const;
const STEP_ICONS = [Mic, MessageSquare, Zap];

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ userName, onClose }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const StepIcon = STEP_ICONS[step];
  const stepKey = STEP_KEYS[step];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col transform transition-all duration-300 scale-95 animate-scale-in">
        <header className="flex items-center justify-between p-4 border-b border-immigo-gray-200">
            <div className="flex items-center gap-3">
                <Hand className="w-6 h-6 text-art-blue-600" />
                <h2 className="text-xl font-bold text-deep-navy font-display">{t('welcome.title', { name: userName })}</h2>
            </div>
            <button onClick={onClose} aria-label={t('welcome.close')} className="p-2 rounded-full hover:bg-immigo-gray-100 transition-colors">
                <X className="w-5 h-5 text-immigo-gray-600" />
            </button>
        </header>

        <main className="p-8 text-center">
            <div className="w-16 h-16 bg-art-blue-100 text-art-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <StepIcon className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-deep-navy mb-2">{t(`welcome.steps.${stepKey}.title`)}</h3>
            <p className="text-immigo-gray-600 min-h-[72px]">{t(`welcome.steps.${stepKey}.description`)}</p>
        </main>

        <footer className="p-6 bg-immigo-gray-50 rounded-b-2xl flex items-center justify-between">
            <div className="flex gap-2">
                {STEP_KEYS.map((key, index) => (
                    <button
                        key={key}
                        onClick={() => setStep(index)}
                        className={`w-2 h-2 rounded-full ${index === step ? 'bg-art-blue-600' : 'bg-immigo-gray-300 hover:bg-immigo-gray-400'}`}
                        aria-label={t('welcome.goToStep', { step: index + 1 })}
                    />
                ))}
            </div>
            {step < STEP_KEYS.length - 1 ? (
                <button
                    onClick={() => setStep(s => s + 1)}
                    className="flex items-center gap-2 px-5 py-2 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500 transition-transform transform hover:scale-105"
                >
                    {t('welcome.next')} <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                </button>
            ) : (
                <button
                    onClick={onClose}
                    className="px-5 py-2 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500 transition-transform transform hover:scale-105"
                >
                    {t('welcome.start')}
                </button>
            )}
        </footer>
      </div>
    </div>
  );
};
