import React, { useState } from 'react';
import { X, Sparkles, BrainCircuit, Loader2, ArrowRight, BookOpenCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { MockExamFeedback } from '../services/apiClient';
import type { SimulationMode } from '../context/conversationContextTypes';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  feedback: MockExamFeedback | null;
  report: string | null;
  error: string | null;
  onStartPractice: (mode: SimulationMode) => void;
  onChooseMode: (mode: SimulationMode) => void;
  onSetGoal: (goal: string, mode: SimulationMode) => void;
  onStartNewExam: () => void;
  onRetry: () => void;
}

const MODES: SimulationMode[] = ['practice', 'study', 'standard'];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen, onClose, isLoading, feedback, report, error,
  onStartPractice, onChooseMode, onSetGoal, onStartNewExam, onRetry,
}) => {
  const { t, i18n } = useTranslation('conversation');
  const modalRef = useFocusTrap(isOpen);
  const [showModes, setShowModes] = useState(false);
  const [showGoal, setShowGoal] = useState(false);
  const [goal, setGoal] = useState('');
  const [goalMode, setGoalMode] = useState<SimulationMode>('practice');
  if (!isOpen) return null;

  const modeName = (mode: SimulationMode) => t(`workspace.examReview.modes.${mode}`);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="exam-review-title" dir={i18n.language === 'ar-SA' ? 'rtl' : 'ltr'} onKeyDown={event => { if (event.key === 'Escape') onClose(); }} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-star-white text-start shadow-2xl outline-none dark:bg-gray-800">
        <header className="flex flex-shrink-0 items-center justify-between border-b border-immigo-gray-200 p-5 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-art-blue-600" aria-hidden="true" />
            <div>
              <h2 id="exam-review-title" className="text-xl font-bold text-deep-navy dark:text-white">{t('workspace.examReview.title')}</h2>
              <p className="text-xs text-immigo-gray-500 dark:text-gray-400">{t('workspace.examReview.subtitle')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('workspace.examReview.close')} className="rounded-full p-2 transition hover:bg-immigo-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5 text-immigo-gray-600 dark:text-gray-300" />
          </button>
        </header>

        <main className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-7">
          {isLoading ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center text-immigo-gray-600 dark:text-gray-300" role="status">
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-art-blue-600" />
              <p className="font-semibold">{t('workspace.examReview.loadingTitle')}</p>
              <p className="mt-1 text-sm">{t('workspace.examReview.loadingBody')}</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-art-red-200 bg-art-red-50 p-4 text-sm text-art-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" role="alert">
              <p className="font-semibold">{t('workspace.examReview.errorTitle')}</p>
              <p className="mt-1">{error}</p>
              <button type="button" onClick={onRetry} className="mt-3 min-h-10 rounded-lg border border-art-red-300 px-3 py-2 font-semibold hover:bg-art-red-100 dark:border-red-800 dark:hover:bg-red-950/50">{t('workspace.examReview.retry')}</button>
            </div>
          ) : feedback ? (
            <>
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-deep-navy dark:text-white"><BrainCircuit className="h-5 w-5" />{t('workspace.examReview.summary')}</h3>
                <p className="text-sm leading-relaxed text-immigo-gray-700 dark:text-gray-200">{feedback.summary}</p>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
                  <h3 className="mb-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">{t('workspace.examReview.strengths')}</h3>
                  <ul className="list-inside list-disc space-y-1.5 text-sm text-emerald-900 dark:text-emerald-100">
                    {feedback.strengths.map((item, index) => <li key={`strength-${index}`}>{item}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30">
                  <h3 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-200">{t('workspace.examReview.toImprove')}</h3>
                  <ul className="list-inside list-disc space-y-1.5 text-sm text-amber-950 dark:text-amber-100">
                    {feedback.suggestions.map((item, index) => <li key={`suggestion-${index}`}>{item}</li>)}
                  </ul>
                </div>
              </section>

              {report && <details className="rounded-xl border border-immigo-gray-200 p-4 dark:border-gray-700">
                <summary className="cursor-pointer text-sm font-semibold text-deep-navy dark:text-white">{t('workspace.examReview.showReport')}</summary>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-immigo-gray-700 dark:text-gray-200">{report}</pre>
              </details>}

              <section className="rounded-xl border border-art-blue-100 bg-art-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                <h3 className="font-semibold text-deep-navy dark:text-white">{t('workspace.examReview.nextTitle')}</h3>
                <p className="mt-1 text-sm text-immigo-gray-700 dark:text-gray-200">{feedback.recommendationReason}</p>
                <button type="button" onClick={() => onStartPractice(feedback.recommendedMode)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-art-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-art-blue-700">
                  {t('workspace.examReview.startPractice', { mode: modeName(feedback.recommendedMode) })}<ArrowRight className="h-4 w-4" />
                </button>
              </section>

              <section className="space-y-3 border-t border-immigo-gray-200 pt-4 dark:border-gray-700">
                {!showModes ? (
                  <button type="button" onClick={() => setShowModes(true)} className="block text-sm font-semibold text-art-blue-700 underline-offset-2 hover:underline dark:text-blue-300">{t('workspace.examReview.chooseMode')}</button>
                ) : (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-deep-navy dark:text-white">{t('workspace.examReview.chooseMode')}</p>
                    <div className="flex flex-wrap gap-2">
                      {MODES.map(mode => <button type="button" key={mode} onClick={() => onChooseMode(mode)} className="min-h-10 rounded-lg border border-immigo-gray-300 px-3 py-2 text-sm font-medium text-deep-navy hover:border-art-blue-500 hover:bg-art-blue-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-blue-950/40">{modeName(mode)}</button>)}
                    </div>
                  </div>
                )}

                {!showGoal ? (
                  <button type="button" onClick={() => setShowGoal(true)} className="block text-sm font-semibold text-art-blue-700 underline-offset-2 hover:underline dark:text-blue-300">{t('workspace.examReview.setGoal')}</button>
                ) : (
                  <form onSubmit={event => { event.preventDefault(); const cleanGoal = goal.trim(); if (cleanGoal) onSetGoal(cleanGoal, goalMode); }} className="space-y-3 rounded-xl bg-immigo-gray-50 p-4 dark:bg-gray-900/60">
                    <label htmlFor="exam-review-goal" className="block text-sm font-semibold text-deep-navy dark:text-white">{t('workspace.examReview.goalLabel')}</label>
                    <textarea id="exam-review-goal" value={goal} onChange={event => setGoal(event.target.value.slice(0, 300))} rows={2} maxLength={300} className="w-full rounded-lg border border-immigo-gray-300 bg-white p-3 text-sm text-deep-navy focus:border-art-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" placeholder={t('workspace.examReview.goalPlaceholder')} />
                    <label htmlFor="exam-review-goal-mode" className="block text-xs font-medium text-immigo-gray-600 dark:text-gray-300">{t('workspace.examReview.goalMode')}</label>
                    <select id="exam-review-goal-mode" value={goalMode} onChange={event => setGoalMode(event.target.value as SimulationMode)} className="w-full rounded-lg border border-immigo-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                      {MODES.filter(mode => mode !== 'standard').map(mode => <option key={mode} value={mode}>{modeName(mode)}</option>)}
                    </select>
                    <button type="submit" disabled={!goal.trim()} className="min-h-10 rounded-lg bg-art-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-art-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{t('workspace.examReview.useGoal')}</button>
                  </form>
                )}

                <button type="button" onClick={onStartNewExam} className="flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-medium text-immigo-gray-700 hover:text-art-blue-700 dark:text-gray-200 dark:hover:text-blue-300"><BookOpenCheck className="h-4 w-4" />{t('workspace.examReview.newExam')}</button>
                <button type="button" onClick={onClose} className="block min-h-10 text-sm font-semibold text-immigo-gray-600 underline-offset-2 hover:underline dark:text-gray-300">{t('workspace.examReview.keepChatting')}</button>
              </section>
            </>
          ) : null}
        </main>
      </section>
    </div>
  );
};
