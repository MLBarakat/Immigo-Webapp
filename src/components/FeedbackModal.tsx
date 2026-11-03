import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleHelp,
  Loader2,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type {
  MockExamQuestionOutcome,
  MockExamReview,
  MockExamReviewDecision,
  MockExamReviewDecisionChoice,
} from '../services/apiClient';

interface FeedbackModalProps {
  isOpen: boolean;
  examId: string;
  onClose: () => void;
  isLoading: boolean;
  review: MockExamReview | null;
  error: string | null;
  decision: MockExamReviewDecision | null;
  decisionSaving: boolean;
  decisionError: string | null;
  onSaveDecision: (
    choice: MockExamReviewDecisionChoice,
    note: string | null,
  ) => Promise<MockExamReviewDecision | null>;
  onContinueDecision: (decision: MockExamReviewDecision) => Promise<boolean>;
  onRetry: () => void;
}

const choices: Array<{
  choice: MockExamReviewDecisionChoice;
  titleKey: string;
  descriptionKey: string;
}> = [
  {
    choice: 'practice',
    titleKey: 'workspace.examReview.choices.practiceTitle',
    descriptionKey: 'workspace.examReview.choices.practiceDescription',
  },
  {
    choice: 'study',
    titleKey: 'workspace.examReview.choices.studyTitle',
    descriptionKey: 'workspace.examReview.choices.studyDescription',
  },
  {
    choice: 'new_interview',
    titleKey: 'workspace.examReview.choices.newInterviewTitle',
    descriptionKey: 'workspace.examReview.choices.newInterviewDescription',
  },
  {
    choice: 'review_answers',
    titleKey: 'workspace.examReview.choices.reviewAnswersTitle',
    descriptionKey: 'workspace.examReview.choices.reviewAnswersDescription',
  },
  {
    choice: 'finish_for_now',
    titleKey: 'workspace.examReview.choices.finishTitle',
    descriptionKey: 'workspace.examReview.choices.finishDescription',
  },
];

function outcomeClass(verdict: MockExamQuestionOutcome['verdict']): string {
  if (verdict === 'correct') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100';
  }
  if (verdict === 'partial') {
    return 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100';
  }
  return 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100';
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  examId,
  onClose,
  isLoading,
  review,
  error,
  decision,
  decisionSaving,
  decisionError,
  onSaveDecision,
  onContinueDecision,
  onRetry,
}) => {
  const { t, i18n } = useTranslation('conversation');
  const modalRef = useFocusTrap(isOpen);
  const questionSectionRef = useRef<HTMLElement>(null);
  const [pendingChoice, setPendingChoice] = useState<MockExamReviewDecisionChoice | null>(null);
  const [goal, setGoal] = useState('');
  const [locallySavedDecision, setLocallySavedDecision] = useState<MockExamReviewDecision | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentDecision = decision ?? locallySavedDecision;

  if (!isOpen) return null;

  const close = () => {
    setPendingChoice(null);
    setGoal('');
    setLocalError(null);
    setContinueError(null);
    onClose();
  };

  const choose = (choice: MockExamReviewDecisionChoice) => {
    setPendingChoice(choice);
    setGoal('');
    setLocalError(null);
    setContinueError(null);
  };

  const saveChoice = async () => {
    if (!pendingChoice || saving || decisionSaving) return;
    const needsGoal = pendingChoice === 'practice' || pendingChoice === 'study';
    const note = needsGoal ? goal.trim() : null;
    if (needsGoal && (!note || note.length > 300)) return;

    setSaving(true);
    setLocalError(null);
    try {
      const saved = await onSaveDecision(pendingChoice, note);
      if (!saved) {
        setLocalError(t('workspace.examReview.saveFailed'));
        return;
      }
      setLocallySavedDecision(saved);
      setPendingChoice(null);
      setGoal('');
      if (saved.choice === 'review_answers') setQuestionsExpanded(true);
    } catch {
      setLocalError(t('workspace.examReview.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const continueWithSavedDecision = async () => {
    if (!currentDecision || continuing) return;
    setContinuing(true);
    setContinueError(null);
    try {
      const continued = await onContinueDecision(currentDecision);
      if (!continued) setContinueError(t('workspace.examReview.continueFailed'));
    } catch {
      setContinueError(t('workspace.examReview.continueFailed'));
    } finally {
      setContinuing(false);
    }
  };

  const modeForDecision = currentDecision?.choice === 'practice'
    ? 'practice'
    : currentDecision?.choice === 'study'
      ? 'study'
      : null;
  const englishStatus = (passed: boolean | null) => passed === null
    ? t('workspace.examReview.notRecorded')
    : passed
      ? t('workspace.examReview.passed')
      : t('workspace.examReview.needsReview');

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 sm:p-5"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-review-title"
        dir={i18n.language === 'ar-SA' ? 'rtl' : 'ltr'}
        onKeyDown={event => {
          if (event.key === 'Escape') close();
        }}
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-star-white text-start shadow-2xl outline-none dark:bg-gray-900"
      >
        <header className="flex flex-shrink-0 items-center justify-between border-b border-immigo-gray-200 bg-gradient-to-r from-blue-50 to-white p-4 dark:border-gray-700 dark:from-blue-950/40 dark:to-gray-900 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-art-blue-100 text-art-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="exam-review-title" className="text-xl font-bold text-deep-navy dark:text-white sm:text-2xl">
                {t('workspace.examReview.title')}
              </h2>
              <p className="mt-0.5 text-sm text-immigo-gray-600 dark:text-gray-300">
                {t('workspace.examReview.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t('workspace.examReview.close')}
            className="ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-immigo-gray-600 transition hover:bg-immigo-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-art-blue-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <main className="flex-1 space-y-5 overflow-y-auto p-4 sm:space-y-6 sm:p-7">
          {isLoading ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center text-immigo-gray-600 dark:text-gray-300" role="status">
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-art-blue-600" aria-hidden="true" />
              <p className="font-semibold">{t('workspace.examReview.loadingTitle')}</p>
              <p className="mt-1 text-sm">{t('workspace.examReview.loadingBody')}</p>
            </div>
          ) : !review ? (
            <div className="rounded-2xl border border-art-red-200 bg-art-red-50 p-4 text-sm text-art-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" role="alert">
              <p className="font-semibold">{t('workspace.examReview.errorTitle')}</p>
              <p className="mt-1">{error ?? t('workspace.examReview.loadFailed')}</p>
              <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl border border-art-red-300 px-4 py-2 font-semibold hover:bg-art-red-100 dark:border-red-800 dark:hover:bg-red-950/50">
                {t('workspace.examReview.retry')}
              </button>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30 sm:p-5">
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-deep-navy dark:text-white">
                  <BrainCircuit className="h-5 w-5 text-art-blue-700 dark:text-blue-300" aria-hidden="true" />
                  {t('workspace.examReview.overview')}
                </h3>
                <p className="text-sm leading-relaxed text-immigo-gray-700 dark:text-gray-200">{review.feedback.summary}</p>
                <p className="mt-3 text-xs font-medium text-immigo-gray-600 dark:text-gray-300">
                  {t('workspace.examReview.questionBank', { version: review.scorecard.testVersion })}
                </p>
              </section>

              <section aria-labelledby="exam-score-title">
                <h3 id="exam-score-title" className="mb-3 flex items-center gap-2 font-semibold text-deep-navy dark:text-white">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  {t('workspace.examReview.scoreBreakdown')}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-immigo-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-immigo-gray-500 dark:text-gray-400">
                      {t('workspace.examReview.accuracy')}
                    </p>
                    <p className="mt-1 text-3xl font-bold text-art-blue-700 dark:text-blue-300">
                      {review.scorecard.civics.accuracyPercent}%
                    </p>
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-immigo-gray-200 dark:bg-gray-700"
                      role="progressbar"
                      aria-label={t('workspace.examReview.accuracy')}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={review.scorecard.civics.accuracyPercent}
                    >
                      <div
                        className="h-full rounded-full bg-art-blue-600"
                        style={{ width: `${review.scorecard.civics.accuracyPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                      {t('workspace.examReview.correct')}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                      {t('workspace.examReview.scoreOfTotal', {
                        score: review.scorecard.civics.correct,
                        total: review.scorecard.civics.total,
                      })}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-300">
                      {t('workspace.examReview.incorrect')}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-rose-900 dark:text-rose-100">
                      {review.scorecard.civics.incorrect}
                    </p>
                  </div>
                </div>

                {review.scorecard.english.included && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-immigo-gray-200 p-3 text-sm dark:border-gray-700">
                      {t('workspace.examReview.englishStatus', {
                        section: t('workspace.examReview.readingPractice'),
                        status: englishStatus(review.scorecard.english.readingPassed),
                      })}
                    </div>
                    <div className="rounded-xl border border-immigo-gray-200 p-3 text-sm dark:border-gray-700">
                      {t('workspace.examReview.englishStatus', {
                        section: t('workspace.examReview.writingPractice'),
                        status: englishStatus(review.scorecard.english.writingPassed),
                      })}
                    </div>
                  </div>
                )}
                <p className="mt-2 text-xs text-immigo-gray-500 dark:text-gray-400">
                  {t('workspace.examReview.scoreDisclaimer')}
                </p>
              </section>

              <section ref={questionSectionRef} tabIndex={-1} aria-labelledby="exam-questions-title" className="scroll-mt-3">
                <details
                  open={questionsExpanded}
                  onToggle={event => setQuestionsExpanded(event.currentTarget.open)}
                  className="overflow-hidden rounded-2xl border border-immigo-gray-200 dark:border-gray-700"
                >
                  <summary id="exam-questions-title" className="flex min-h-12 cursor-pointer list-none items-center gap-2 p-4 font-semibold text-deep-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-art-blue-600 dark:text-white">
                    <CircleHelp className="h-5 w-5 text-art-blue-600 dark:text-blue-300" aria-hidden="true" />
                    <span>{t('workspace.examReview.questionByQuestion')}</span>
                    <span className="ms-auto text-xs font-normal text-immigo-gray-500 dark:text-gray-400">
                      {review.questionOutcomes.length}
                    </span>
                  </summary>
                  <ol className="space-y-3 border-t border-immigo-gray-200 p-4 dark:border-gray-700">
                    {review.questionOutcomes.map((outcome, index) => (
                      <li key={`${index}-${outcome.question}`} className={`rounded-xl border p-4 ${outcomeClass(outcome.verdict)}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-medium">{outcome.question}</p>
                          <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold dark:bg-black/20">
                            {t(`workspace.examReview.verdicts.${outcome.verdict}`)}
                          </span>
                        </div>
                        {outcome.acceptableAnswers && outcome.acceptableAnswers.length > 0 && (
                          <p className="mt-2 text-xs leading-relaxed">
                            <span className="font-semibold">{t('workspace.examReview.acceptableAnswers')}: </span>
                            {outcome.acceptableAnswers.join(', ')}
                          </p>
                        )}
                      </li>
                    ))}
                    {review.questionOutcomes.length === 0 && (
                      <li className="text-sm text-immigo-gray-600 dark:text-gray-300">
                        {t('workspace.examReview.noQuestionOutcomes')}
                      </li>
                    )}
                  </ol>
                </details>
              </section>

              <section aria-labelledby="exam-focus-title">
                <h3 id="exam-focus-title" className="mb-3 flex items-center gap-2 font-semibold text-deep-navy dark:text-white">
                  <Target className="h-5 w-5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                  {t('workspace.examReview.strengthsAndFocus')}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <h4 className="mb-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                      {t('workspace.examReview.strengths')}
                    </h4>
                    <ul className="list-inside list-disc space-y-1.5 text-sm text-emerald-900 dark:text-emerald-100">
                      {review.feedback.strengths.map((item, index) => <li key={`strength-${index}`}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                    <h4 className="mb-2 text-sm font-semibold text-amber-950 dark:text-amber-200">
                      {t('workspace.examReview.focusAreas')}
                    </h4>
                    <ul className="list-inside list-disc space-y-1.5 text-sm text-amber-950 dark:text-amber-100">
                      {review.feedback.suggestions.map((item, index) => <li key={`suggestion-${index}`}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              </section>

              <section aria-labelledby="exam-next-step-title" className="space-y-4 border-t border-immigo-gray-200 pt-5 dark:border-gray-700">
                <div>
                  <h3 id="exam-next-step-title" className="font-semibold text-deep-navy dark:text-white">
                    {t('workspace.examReview.nextTitle')}
                  </h3>
                  <p className="mt-1 text-sm text-immigo-gray-600 dark:text-gray-300">
                    {review.feedback.recommendationReason}
                  </p>
                  <p className="mt-2 text-xs text-immigo-gray-500 dark:text-gray-400">
                    {t('workspace.examReview.immutableChoiceNotice')}
                  </p>
                </div>

                {currentDecision ? (
                  <div className="rounded-2xl border border-art-blue-200 bg-art-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30" role="status" aria-live="polite">
                    <p className="font-semibold text-deep-navy dark:text-white">{t('workspace.examReview.choiceSaved')}</p>
                    <p className="mt-1 text-sm text-immigo-gray-700 dark:text-gray-200">
                      {t(`workspace.examReview.savedChoices.${currentDecision.choice}`)}
                    </p>
                    {currentDecision.note && (
                      <p className="mt-2 rounded-xl bg-white/70 p-3 text-sm text-deep-navy dark:bg-black/20 dark:text-gray-100">
                        {currentDecision.note}
                      </p>
                    )}
                    {(modeForDecision || currentDecision.choice === 'new_interview') && (
                      <button
                        type="button"
                        onClick={() => { void continueWithSavedDecision(); }}
                        disabled={continuing}
                        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-art-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-art-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-art-blue-700 disabled:cursor-wait disabled:opacity-60"
                      >
                        {continuing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {modeForDecision
                          ? t('workspace.examReview.continueInMode', {
                            mode: t(`workspace.examReview.modes.${modeForDecision}`),
                          })
                          : t('workspace.examReview.startNewInterview')}
                        {!continuing && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    )}
                    {(continueError || decisionError) && (
                      <p className="mt-3 text-sm text-art-red-800 dark:text-red-200" role="alert">
                        {continueError ?? decisionError}
                      </p>
                    )}
                    {currentDecision.choice === 'review_answers' && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuestionsExpanded(true);
                          questionSectionRef.current?.focus();
                        }}
                        className="mt-4 min-h-11 rounded-xl border border-art-blue-300 px-4 py-2 text-sm font-semibold text-art-blue-800 hover:bg-art-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-art-blue-700 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950/60"
                      >
                        {t('workspace.examReview.openQuestionReview')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={close}
                      className="ms-2 mt-4 min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-immigo-gray-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-art-blue-600 dark:text-gray-200"
                    >
                      {t('workspace.examReview.closeReport')}
                    </button>
                  </div>
                ) : (
                  <>
                    {pendingChoice ? (
                      <div className="space-y-3 rounded-2xl border border-art-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-gray-800">
                        <p className="font-semibold text-deep-navy dark:text-white">
                          {t(choices.find(item => item.choice === pendingChoice)?.titleKey ?? '')}
                        </p>
                        {(pendingChoice === 'practice' || pendingChoice === 'study') && (
                          <div>
                            <label htmlFor={`exam-review-goal-${examId}`} className="mb-1.5 block text-sm font-medium text-deep-navy dark:text-white">
                              {t('workspace.examReview.goalLabel')}
                            </label>
                            <textarea
                              id={`exam-review-goal-${examId}`}
                              value={goal}
                              onChange={event => setGoal(event.target.value.slice(0, 300))}
                              rows={3}
                              maxLength={300}
                              required
                              className="w-full rounded-xl border border-immigo-gray-300 bg-white p-3 text-sm text-deep-navy focus:border-art-blue-600 focus:outline-none focus:ring-2 focus:ring-art-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:ring-blue-900"
                              placeholder={t('workspace.examReview.goalPlaceholder')}
                            />
                            <p className="mt-1 text-end text-xs text-immigo-gray-500 dark:text-gray-400">
                              {goal.trim().length}/300
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-immigo-gray-600 dark:text-gray-300">
                          {t('workspace.examReview.confirmChoice')}
                        </p>
                        {(decisionError || localError) && (
                          <p role="alert" className="text-sm text-art-red-800 dark:text-red-200">
                            {decisionError ?? localError}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => { void saveChoice(); }}
                            disabled={saving || decisionSaving || ((pendingChoice === 'practice' || pendingChoice === 'study') && !goal.trim())}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-art-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-art-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-art-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {(saving || decisionSaving) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            {t('workspace.examReview.saveChoice')}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setPendingChoice(null); setGoal(''); setLocalError(null); }}
                            disabled={saving || decisionSaving}
                            className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-immigo-gray-700 hover:bg-immigo-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-art-blue-600 dark:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                          >
                            {t('workspace.examReview.cancelChoice')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {choices.map(({ choice, titleKey, descriptionKey }) => (
                          <button
                            type="button"
                            key={choice}
                            onClick={() => choose(choice)}
                            className="group min-h-16 rounded-2xl border border-immigo-gray-200 bg-white p-4 text-start transition hover:border-art-blue-400 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-art-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/40"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-deep-navy dark:text-white">{t(titleKey)}</span>
                              <ArrowRight className="h-4 w-4 shrink-0 text-art-blue-600 transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-immigo-gray-600 dark:text-gray-300">{t(descriptionKey)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {(decisionError || localError) && !currentDecision && !pendingChoice && (
                  <p role="alert" className="text-sm text-art-red-800 dark:text-red-200">
                    {decisionError ?? localError}
                  </p>
                )}
              </section>

              <details className="rounded-2xl border border-immigo-gray-200 p-4 dark:border-gray-700">
                <summary className="min-h-8 cursor-pointer font-semibold text-deep-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-art-blue-600 dark:text-white">
                  {t('workspace.examReview.fullReport')}
                </summary>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-immigo-gray-700 dark:text-gray-200">
                  {review.report}
                </pre>
              </details>
            </>
          )}
        </main>
      </section>
    </div>
  );
};
