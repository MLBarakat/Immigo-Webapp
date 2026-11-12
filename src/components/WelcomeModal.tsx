import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronRight, Hand, Mic, MessageSquare, Zap, ArrowRight, X } from 'lucide-react';
import { useDraggableOverlay } from '../hooks/useDraggableOverlay';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { SimulationMode } from '../context/conversationContextTypes';

interface WelcomeModalProps {
  userName: string;
  onClose: () => void;
  /** Selects the learner's first Learning Mode and closes the welcome. */
  onSelectMode?: (mode: SimulationMode) => void;
}

const STEP_KEYS = ['start', 'speak', 'interrupt'] as const;
const STEP_ICONS = [Mic, MessageSquare, Zap];
const MODE_OPTIONS = [
  { mode: 'standard', icon: Mic },
  { mode: 'practice', icon: Zap },
  { mode: 'study', icon: BookOpen },
] as const;

const MODE_COLORS: Record<string, string> = {
  standard: 'text-art-blue-600 bg-art-blue-50 border-art-blue-100',
  practice: 'text-amber-600 bg-amber-50 border-amber-100',
  study: 'text-emerald-600 bg-emerald-50 border-emerald-100',
};

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ userName, onClose, onSelectMode }) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar-SA';
  const [step, setStep] = useState(0);
  const { overlayRef, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableOverlay<HTMLDivElement>();
  useFocusTrap(true, overlayRef);
  const StepIcon = STEP_ICONS[step];
  const stepKey = STEP_KEYS[step];
  const isModeStep = step === STEP_KEYS.length - 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="welcome-title" dir={isArabic ? 'rtl' : 'ltr'} className="bg-star-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col transform transition-all duration-300 scale-95 animate-scale-in outline-none">
        <header
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="flex items-center justify-between p-4 border-b border-immigo-gray-200 cursor-grab active:cursor-grabbing touch-none select-none"
        >
            <div className="flex items-center gap-3">
                <Hand className="w-6 h-6 text-art-blue-600" />
                <h2 id="welcome-title" className="text-xl font-bold text-deep-navy font-display">{t('welcome.title', { name: userName })}</h2>
            </div>
            <button onClick={onClose} aria-label={t('welcome.close')} className="p-2 rounded-full hover:bg-immigo-gray-100 transition-colors">
                <X className="w-5 h-5 text-immigo-gray-600" />
            </button>
        </header>

        <main className="p-8 text-center">
            <div className="w-16 h-16 bg-art-blue-100 text-art-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <StepIcon className="w-8 h-8" />
            </div>
            {isModeStep ? (
                <>
                    <h3 className="text-2xl font-bold text-deep-navy mb-2">{t('welcome.modes.title')}</h3>
                    <p className="text-immigo-gray-600 min-h-[72px]">{t('welcome.modes.description')}</p>
                    <div className="mt-4 flex flex-col gap-2">
                        {MODE_OPTIONS.map(({ mode, icon: ModeIcon }) => {
                          const colorClass = MODE_COLORS[mode];
                          return (
                            <button
                              key={mode}
                              onClick={() => (onSelectMode ? onSelectMode(mode) : onClose())}
                              className={`group flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border border-immigo-gray-200 bg-star-white text-left hover:border-art-blue-400 hover:bg-art-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-art-blue-500 focus-visible:ring-offset-2 transition-all duration-200`}
                            >
                              <div className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg ${colorClass}`}>
                                <ModeIcon className="w-5 h-5 shrink-0" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="block font-semibold text-deep-navy group-hover:text-art-blue-600 transition-colors">
                                  {t(`welcome.modes.${mode}.label`)}
                                </span>
                                <p className="mt-0.5 text-xs text-immigo-gray-500 leading-relaxed line-clamp-2">
                                  {t(`welcome.modes.${mode}.description`)}
                                </p>
                              </div>
                              <ChevronRight className="shrink-0 w-4 h-4 text-immigo-gray-300 group-hover:text-art-blue-500 transition-colors rtl:rotate-180" aria-hidden="true" />
                            </button>
                          );
                        })}
                    </div>
                </>
            ) : (
                <>
                    <h3 className="text-2xl font-bold text-deep-navy mb-2">{t(`welcome.steps.${stepKey}.title`)}</h3>
                    <p className="text-immigo-gray-600 min-h-[72px]">{t(`welcome.steps.${stepKey}.description`)}</p>
                </>
            )}
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
            {!isModeStep && (
                <button
                    onClick={() => setStep(s => s + 1)}
                    className="flex items-center gap-2 px-5 py-2 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500 transition-transform transform hover:scale-105"
                >
                    {t('welcome.next')} <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                </button>
            )}
        </footer>
      </div>
    </div>
  );
};
