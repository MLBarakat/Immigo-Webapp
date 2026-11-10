import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronLeft, Trash2, Download, SlidersHorizontal, AlertTriangle, Wrench, Target } from 'lucide-react';
import { AppStatus, SimulationMode, TestVersion } from '../context/conversationContextTypes';
import { fetchQuestionMastery } from '../services/liveProgressService';
import type { QuestionMastery } from '../services/liveProgressService';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  getFocusCategories,
  parseLearningGoal,
  serializeLearningGoal,
} from '../constants/focusCategories';

export interface LearningGoalUpdates {
  learning_goal?: string | null;
  weekly_graded_answer_target?: number | null;
}

interface RightPanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  simulationMode: SimulationMode;
  onSimulationModeChange: (mode: SimulationMode) => void | boolean | Promise<void | boolean>;
  hasUnfinishedStandardInterview?: boolean;
  isCheckingStandardInterview?: boolean;
  standardInterviewLookupFailed?: boolean;
  onRetryStandardInterviewLookup?: () => void;
  onResumeStandardInterview?: () => void | boolean | Promise<void | boolean>;
  onStartNewStandardInterview?: () => void | boolean | Promise<void | boolean>;
  testVersion: TestVersion;
  onTestVersionChange: (version: TestVersion) => void;
  includeEnglishSimulation: boolean;
  onIncludeEnglishSimulationChange: (include: boolean) => void;
  userId?: string | null;
  currentItemId?: string | null;
  onClearSession: () => void;
  onDownloadTranscript: () => void;
  conversationLength: number;
  appStatus: AppStatus;
  learningGoal?: string | null;
  weeklyGradedAnswerTarget?: number | null;
  onUpdateLearningGoals?: (updates: LearningGoalUpdates) => Promise<void> | void;
  isMobile?: boolean;
}

const MODE_IDS: SimulationMode[] = ['standard', 'practice', 'study'];

export function RightPanel({
  isCollapsed,
  onToggleCollapse,
  simulationMode,
  onSimulationModeChange,
  hasUnfinishedStandardInterview = false,
  isCheckingStandardInterview = false,
  standardInterviewLookupFailed = false,
  onRetryStandardInterviewLookup,
  onResumeStandardInterview,
  onStartNewStandardInterview,
  testVersion,
  onTestVersionChange,
  includeEnglishSimulation,
  onIncludeEnglishSimulationChange,
  userId,
  currentItemId,
  onClearSession,
  onDownloadTranscript,
  conversationLength,
  appStatus,
  learningGoal = null,
  weeklyGradedAnswerTarget = null,
  onUpdateLearningGoals,
  isMobile = false,
}: RightPanelProps) {
  const { t, i18n } = useTranslation('conversation');
  const isArabic = i18n.language === 'ar-SA';
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [modeDecision, setModeDecision] = useState<
    { type: 'pause'; mode: SimulationMode } | { type: 'resume' } | null
  >(null);
  const [modeDecisionError, setModeDecisionError] = useState(false);
  const [isApplyingModeDecision, setIsApplyingModeDecision] = useState(false);
  const [modeChangeError, setModeChangeError] = useState(false);
  const modeDecisionRef = useFocusTrap(Boolean(modeDecision));
  const [questionMasteryResult, setQuestionMasteryResult] = useState<{
    key: string;
    value: QuestionMastery | null;
  } | null>(null);
  const questionMasteryKey = userId && currentItemId ? `${userId}:${testVersion}:${currentItemId}` : null;
  const questionMastery = questionMasteryKey && questionMasteryResult?.key === questionMasteryKey
    ? questionMasteryResult.value
    : null;
  useEffect(() => {
    let active = true;
    if (!userId || !currentItemId) return () => { active = false; };
    void fetchQuestionMastery(userId, currentItemId, testVersion).then(value => {
      if (active) setQuestionMasteryResult({ key: `${userId}:${testVersion}:${currentItemId}`, value });
    });
    return () => { active = false; };
  }, [userId, currentItemId, testVersion]);

  const initialGoal = parseLearningGoal(learningGoal, testVersion);
  const [selectedFocusIds, setSelectedFocusIds] = useState<string[]>(initialGoal.selectedIds);
  const [otherFocus, setOtherFocus] = useState(initialGoal.other);
  const [weeklyTarget, setWeeklyTarget] = useState(
    weeklyGradedAnswerTarget === null ? '' : String(weeklyGradedAnswerTarget),
  );
  const goalsSnapshotKey = `${learningGoal ?? ''}|${weeklyGradedAnswerTarget ?? ''}|${testVersion}`;
  const [syncedGoalsKey, setSyncedGoalsKey] = useState(goalsSnapshotKey);
  const [lastSavedGoalsKey, setLastSavedGoalsKey] = useState<string | null>(null);
  const goalsMounted = useRef(false);
  const [goalsSaveError, setGoalsSaveError] = useState(false);
  const focusCategories = getFocusCategories(testVersion);

  // Pick up goals saved elsewhere, but ignore the echo of our own auto-save so
  // in-progress typing is never overwritten.
  if (goalsSnapshotKey !== syncedGoalsKey) {
    setSyncedGoalsKey(goalsSnapshotKey);
    if (lastSavedGoalsKey === goalsSnapshotKey) {
      setLastSavedGoalsKey(null);
    } else {
      const parsed = parseLearningGoal(learningGoal, testVersion);
      setSelectedFocusIds(parsed.selectedIds);
      setOtherFocus(parsed.other);
      setWeeklyTarget(
        weeklyGradedAnswerTarget === null ? '' : String(weeklyGradedAnswerTarget),
      );
    }
  }

  // Auto-save: no Save button. Debounce so typing and multi-select settle first.
  useEffect(() => {
    if (!goalsMounted.current) {
      goalsMounted.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      const goal = serializeLearningGoal(selectedFocusIds, otherFocus, testVersion).trim();
      const parsedTarget = weeklyTarget.trim() === '' ? null : Number(weeklyTarget);
      const updates: LearningGoalUpdates = { learning_goal: goal || null };
      if (parsedTarget !== weeklyGradedAnswerTarget) {
        updates.weekly_graded_answer_target = parsedTarget;
      }
      Promise.resolve(onUpdateLearningGoals?.(updates))
        .then(() => {
          setLastSavedGoalsKey(`${goal}|${parsedTarget ?? ''}|${testVersion}`);
          setGoalsSaveError(false);
        })
        .catch(() => setGoalsSaveError(true));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    selectedFocusIds,
    otherFocus,
    weeklyTarget,
    testVersion,
    weeklyGradedAnswerTarget,
    onUpdateLearningGoals,
  ]);

  const toggleFocusCategory = (id: string) => {
    setSelectedFocusIds(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };
  const isRequestInFlight = appStatus === 'processing' || appStatus === 'speaking';
  const isModeUnavailable = isCheckingStandardInterview || standardInterviewLookupFailed;

  useEffect(() => {
    if (!modeDecision) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isApplyingModeDecision) setModeDecision(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modeDecision, isApplyingModeDecision]);

  const handleModeSelection = (mode: SimulationMode) => {
    if (mode === simulationMode || isModeUnavailable) return;
    if (hasUnfinishedStandardInterview && mode === 'standard') {
      setModeDecisionError(false);
      setModeChangeError(false);
      setModeDecision({ type: 'resume' });
      return;
    }
    if (hasUnfinishedStandardInterview && simulationMode === 'standard') {
      setModeDecisionError(false);
      setModeChangeError(false);
      setModeDecision({ type: 'pause', mode });
      return;
    }
    setModeChangeError(false);
    void (async () => {
      try {
        setModeChangeError((await onSimulationModeChange(mode)) === false);
      } catch {
        setModeChangeError(true);
      }
    })();
  };

  const applyModeDecision = async (action: () => void | boolean | Promise<void | boolean>) => {
    if (isApplyingModeDecision) return;
    setIsApplyingModeDecision(true);
    setModeDecisionError(false);
    try {
      const applied = await action();
      if (applied !== false) setModeDecision(null);
      else setModeDecisionError(true);
    } catch {
      setModeDecisionError(true);
    } finally {
      setIsApplyingModeDecision(false);
    }
  };

  const handleClearRequest = () => {
    if (conversationLength === 0) return;
    setShowClearConfirm(true);
  };

  const handleClearConfirm = () => {
    onClearSession();
    setShowClearConfirm(false);
  };
  const handleCollapsedClear = () => {
    if (conversationLength > 0 && !isRequestInFlight
      && window.confirm(t('workspace.right.clearConfirmMessage'))) {
      onClearSession();
    }
  };

  // Collapsed rail
  if (isCollapsed) {
    return (
      <aside
        className="flex flex-col items-center gap-5 py-4 bg-star-white dark:bg-gray-800 border-l border-immigo-gray-200 dark:border-gray-700 shrink-0 transition-all duration-300"
        style={{ width: '56px' }}
      >
        <button
          onClick={onToggleCollapse}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-immigo-gray-100 text-immigo-gray-600 transition-colors"
          aria-label={t('workspace.right.expand')}
          title={t('workspace.right.expand')}
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
        <div className="flex flex-col items-center gap-4 mt-2">
          <button type="button" onClick={onToggleCollapse} title={t('workspace.right.simulationModes')} aria-label={t('workspace.right.openModes')} className="p-2 rounded-lg hover:bg-immigo-gray-100 text-art-blue-600">
            <SlidersHorizontal className="w-5 h-5" />
          </button>
          <button type="button" title={t('workspace.right.clearTitle')} onClick={handleCollapsedClear} disabled={conversationLength === 0 || isRequestInFlight} aria-label={t('workspace.right.clearTitle')} className="p-2 rounded-lg hover:bg-art-red-50 disabled:opacity-40 text-art-red-600">
            <Trash2 className="w-5 h-5" />
          </button>
          <button type="button" title={t('workspace.right.downloadTitle')} onClick={onDownloadTranscript} disabled={conversationLength === 0} aria-label={t('workspace.right.downloadTitle')} className="p-2 rounded-lg hover:bg-immigo-gray-100 disabled:opacity-40 text-immigo-gray-600">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex flex-col bg-star-white dark:bg-gray-800 border-l border-immigo-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300"
      style={isMobile
        ? { width: '100%', minWidth: 0, maxWidth: 'none' }
        : { width: '23%', minWidth: 'clamp(200px, 23vw, 420px)', maxWidth: 'none', flexBasis: '23%', flexShrink: 1 }}
    >
      {/* The mobile tab bar already names this workspace, so only desktop keeps the panel title. */}
      {!isMobile && (
        <div className={`flex items-center justify-between px-4 py-3 border-b border-immigo-gray-200 dark:border-gray-700 bg-star-white dark:bg-gray-800 sticky top-0 z-10 ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-immigo-gray-100 text-immigo-gray-500 transition-colors"
            aria-label={t('workspace.right.collapse')}
            title={t('workspace.right.collapse')}
          >
            {isArabic ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div className={`flex items-center gap-2 ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
            <SlidersHorizontal className="w-4 h-4 text-art-blue-600" />
            <span className="text-sm font-bold text-deep-navy dark:text-gray-100 tracking-tight">{t('workspace.right.title')}</span>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">

        {/* ── Section 1: Simulation Modes ── */}
        <section>
          <div className={`mb-2 flex items-center gap-2 ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
            <SlidersHorizontal className="w-4 h-4 text-art-blue-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-immigo-gray-600">{t('workspace.right.simulationModes')}</span>
          </div>

          <fieldset className="space-y-1.5" disabled={isModeUnavailable}>
            <legend className="sr-only">{t('workspace.right.modeLegend')}</legend>
            {MODE_IDS.map(modeId => {
              const isSelected = simulationMode === modeId;
              const mode = t(`workspace.right.${modeId}`, { returnObjects: true }) as { label: string; description: string };
              return (
                <label
                  key={modeId}
                  className={`flex items-start gap-2 p-2 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'border-art-blue-600 bg-art-blue-50'
                      : 'border-immigo-gray-200 hover:border-art-blue-300 hover:bg-immigo-gray-50'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'border-art-blue-600' : 'border-immigo-gray-400'
                    }`}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-art-blue-600" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-semibold block ${isSelected ? 'text-art-blue-700' : 'text-deep-navy'}`}>
                      {mode.label}
                    </span>
                    <span className="text-xs text-immigo-gray-500 block mt-0.5">{mode.description}</span>
                  </div>
                  <input
                    type="radio"
                    name="simulation-mode"
                    value={modeId}
                    checked={isSelected}
                    onChange={() => handleModeSelection(modeId)}
                    className="sr-only"
                  />
                </label>
              );
            })}
          </fieldset>
          {isCheckingStandardInterview && (
            <p className="mt-2 text-[11px] text-immigo-gray-500" role="status">{t('workspace.right.checkingInterview')}</p>
          )}
          {standardInterviewLookupFailed && (
            <div className="mt-2 text-[11px] text-art-red-600" role="alert">
              <p>{t('workspace.right.interviewCheckFailed')}</p>
              {onRetryStandardInterviewLookup && (
                <button type="button" onClick={onRetryStandardInterviewLookup} className="mt-1 font-semibold underline">
                  {t('workspace.right.tryAgain')}
                </button>
              )}
            </div>
          )}
          {modeChangeError && (
            <p className="mt-2 text-[11px] text-art-red-600" role="alert">
              {t('workspace.right.interviewActionFailed')}
            </p>
          )}
          <div className="mt-3 space-y-2 rounded-lg border border-immigo-gray-200 p-2.5">
            <fieldset>
              <legend className="mb-1.5 text-[11px] font-semibold text-immigo-gray-600">{t('workspace.right.testVersion')}</legend>
              <div className="grid grid-cols-2 gap-1">
                {(['2008', '2020'] as TestVersion[]).map(version => (
                  <label key={version} className={`cursor-pointer rounded-md border px-2 py-1.5 text-center text-[11px] ${testVersion === version ? 'border-art-blue-600 bg-art-blue-50 font-semibold text-art-blue-700' : 'border-immigo-gray-200 text-immigo-gray-600'}`}>
                    {version === '2008' ? t('workspace.right.version2008') : t('workspace.right.version2020')}
                    <input type="radio" name="test-version" value={version} checked={testVersion === version} onChange={() => onTestVersionChange(version)} className="sr-only" />
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-immigo-gray-700">
              <input type="checkbox" checked={includeEnglishSimulation} onChange={event => onIncludeEnglishSimulationChange(event.target.checked)} className="rounded border-immigo-gray-300 text-art-blue-600 focus:ring-art-blue-500" />
              <span>{t('workspace.right.includeEnglishSimulation')}</span>
            </label>
          </div>
          {currentItemId && (
            <div className="mt-2 rounded-lg bg-immigo-gray-50 px-2.5 py-2 text-[11px] text-immigo-gray-600">
              <div className="font-semibold text-immigo-gray-700">{t('workspace.right.questionMastery')}</div>
              {questionMastery ? (
                <span>{t('workspace.right.masteryStats', { correct: questionMastery.correctCount, attempts: questionMastery.attempts, percent: questionMastery.masteryPct })}{questionMastery.mastered ? ` · ${t('workspace.right.mastered')}` : ''}</span>
              ) : <span>{t('workspace.right.noMasteryYet')}</span>}
            </div>
          )}
        </section>

        <div className="shrink-0 border-t border-immigo-gray-200" />

        {/* ── Section 2: Learning Goals ── */}
        <section aria-labelledby="learning-goals-title">
          <div className={`mb-2 flex items-center gap-2 ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
            <Target className="w-4 h-4 text-art-blue-600" />
            <h3 id="learning-goals-title" className="text-xs font-bold uppercase tracking-widest text-immigo-gray-600">
              {t('workspace.right.learningGoals')}
            </h3>
          </div>
          <p className="text-[11px] text-immigo-gray-500">{t('workspace.right.learningGoalsDescription')}</p>

          <fieldset className="mt-2 space-y-1">
            <legend className="mb-1 text-[11px] font-semibold text-immigo-gray-700">
              {t('workspace.right.focusLabel')}
            </legend>
            {focusCategories.map(category => {
              const checked = selectedFocusIds.includes(category.id);
              const atLimit = selectedFocusIds.length >= 3;
              return (
                <label key={category.id} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-1 text-[11px] text-immigo-gray-700 hover:bg-immigo-gray-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && atLimit}
                    onChange={() => toggleFocusCategory(category.id)}
                    className="h-3.5 w-3.5 rounded border-immigo-gray-300 text-art-blue-600 focus:ring-art-blue-500 disabled:opacity-40"
                  />
                  <span>{category.label}</span>
                </label>
              );
            })}
          </fieldset>

          <label className="mt-2 block space-y-1">
            <span className="text-[11px] font-semibold text-immigo-gray-700">
              {t('workspace.right.otherFocusLabel')}
            </span>
            <input
              type="text"
              aria-label={t('workspace.right.otherFocusLabel')}
              value={otherFocus}
              maxLength={80}
              onChange={event => setOtherFocus(event.target.value.slice(0, 80))}
              placeholder={t('workspace.right.otherFocusPlaceholder')}
              className="w-full rounded-lg border border-immigo-gray-300 bg-white px-2 py-1.5 text-[11px] text-deep-navy focus:border-art-blue-600 focus:outline-none focus:ring-2 focus:ring-art-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </label>

          <label className="mt-2 block space-y-1">
            <span className="text-[11px] font-semibold text-immigo-gray-700">
              {t('workspace.right.weeklyTargetLabel')}
            </span>
            <input
              type="number"
              aria-label={t('workspace.right.weeklyTargetLabel')}
              min={1}
              max={2_147_483_647}
              step={1}
              value={weeklyTarget}
              onChange={event => setWeeklyTarget(event.target.value)}
              placeholder={t('workspace.right.weeklyTargetPlaceholder')}
              className="w-full rounded-lg border border-immigo-gray-300 bg-white px-2 py-1.5 text-[11px] text-deep-navy focus:border-art-blue-600 focus:outline-none focus:ring-2 focus:ring-art-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <p className="mt-1 text-[10px] text-immigo-gray-500" aria-live="polite">
            {goalsSaveError
              ? t('workspace.right.learningGoalsSaveFailed')
              : t('workspace.right.learningGoalsAutoSave')}
          </p>
        </section>

        <div className="shrink-0 border-t border-immigo-gray-200" />

        {/* ── Section 2: Session Utilities ── */}
        <section>
          <div className={`mb-2 flex items-center gap-2 ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
            <Wrench className="w-4 h-4 text-art-blue-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-immigo-gray-600">{t('workspace.right.utilities')}</span>
          </div>

          <div className="space-y-2">
            {/* Clear Session */}
            {showClearConfirm ? (
              <div className="p-3 rounded-xl border-2 border-art-red-300 bg-art-red-50 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-art-red-600 flex-shrink-0" />
                  <p className="text-xs font-semibold text-art-red-700">{t('workspace.right.clearConfirmTitle')}</p>
                </div>
                <p className="text-[11px] text-art-red-600">{t('workspace.right.clearConfirmMessage')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearConfirm}
                    className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-art-red-600 text-star-white hover:bg-art-red-700 transition-colors"
                  >
                    {t('workspace.right.confirmClear')}
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-immigo-gray-300 text-immigo-gray-600 hover:bg-immigo-gray-100 transition-colors"
                  >
                    {t('workspace.right.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleClearRequest}
                disabled={conversationLength === 0 || isRequestInFlight}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border-2 border-art-red-300 text-art-red-600 hover:bg-art-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 font-semibold text-sm"
              >
                <Trash2 className="w-4 h-4 flex-shrink-0" />
                {t('workspace.right.clear')}
              </button>
            )}

            {/* Download Transcript */}
            <button
              onClick={onDownloadTranscript}
              disabled={conversationLength === 0}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border-2 border-immigo-gray-200 text-immigo-gray-700 hover:bg-immigo-gray-50 hover:border-immigo-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 font-semibold text-sm"
            >
              <Download className="w-4 h-4 flex-shrink-0" />
              {t('workspace.right.downloadTranscript')}
            </button>
          </div>
        </section>
      </div>
      {modeDecision && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-deep-navy/50 p-4" role="presentation" onClick={() => { if (!isApplyingModeDecision) setModeDecision(null); }}>
          <section
            ref={modeDecisionRef}
            tabIndex={-1}
            dir={isArabic ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="standard-interview-decision-title"
            className="w-full max-w-md rounded-xl bg-star-white p-5 shadow-xl outline-none"
            onClick={event => event.stopPropagation()}
          >
            <h2 id="standard-interview-decision-title" className="text-base font-bold text-deep-navy">
              {modeDecision.type === 'pause'
                ? t('workspace.right.pauseInterviewTitle')
                : t('workspace.right.unfinishedInterviewTitle')}
            </h2>
            <p className="mt-2 text-sm text-immigo-gray-600">
              {modeDecision.type === 'pause'
                ? t('workspace.right.pauseInterviewDescription')
                : t('workspace.right.unfinishedInterviewDescription')}
            </p>
            {modeDecisionError && (
              <p className="mt-2 text-sm text-art-red-600" role="alert">
                {t('workspace.right.interviewActionFailed')}
              </p>
            )}
            {modeDecision.type === 'pause' ? (
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" disabled={isApplyingModeDecision} onClick={() => setModeDecision(null)} className="min-h-10 rounded-lg border border-immigo-gray-300 px-3 py-2 text-sm font-semibold text-immigo-gray-700 disabled:opacity-50">
                  {t('workspace.right.stayInInterview')}
                </button>
                <button
                  type="button"
                  disabled={isApplyingModeDecision}
                  onClick={() => { void applyModeDecision(() => onSimulationModeChange(modeDecision.mode)); }}
                  className="min-h-10 rounded-lg bg-art-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-art-blue-700 disabled:opacity-50"
                >
                  {t('workspace.right.switchToMode', { mode: t(`workspace.right.${modeDecision.mode}.label`) })}
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" disabled={isApplyingModeDecision} onClick={() => setModeDecision(null)} className="min-h-10 rounded-lg border border-immigo-gray-300 px-3 py-2 text-sm font-semibold text-immigo-gray-700 disabled:opacity-50">
                  {t('workspace.right.cancel')}
                </button>
                <button type="button" disabled={isApplyingModeDecision} onClick={() => { void applyModeDecision(() => onStartNewStandardInterview?.()); }} className="min-h-10 rounded-lg border border-immigo-gray-300 px-3 py-2 text-sm font-semibold text-immigo-gray-700 disabled:opacity-50">
                  {t('workspace.right.startNewInterview')}
                </button>
                <button type="button" disabled={isApplyingModeDecision} onClick={() => { void applyModeDecision(() => onResumeStandardInterview?.()); }} className="min-h-10 rounded-lg bg-art-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-art-blue-700 disabled:opacity-50">
                  {t('workspace.right.resumeInterview')}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
