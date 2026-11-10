import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Target } from 'lucide-react';
import {
  getFocusCategories,
  MAX_FOCUS_CATEGORIES,
  parseLearningGoal,
  type FocusTestVersion,
} from '../constants/focusCategories';
import { FocusAreaCombobox } from './FocusAreaCombobox';
import type { FocusAreaSelection } from './FocusAreaCombobox';

interface FocusOnboardingCardProps {
  mode: 'practice' | 'study';
  testVersion: FocusTestVersion;
  initialGoal: string | null | undefined;
  submitting: boolean;
  error: string | null;
  onSubmit: (selection: FocusAreaSelection) => void;
}

/**
 * Blocking focus card for the first question of Practice/Study. There is no
 * skip path: the learner keeps "All focus areas" or narrows to at most three
 * official categories, then continues into the mode.
 */
export function FocusOnboardingCard({
  mode,
  testVersion,
  initialGoal,
  submitting,
  error,
  onSubmit,
}: FocusOnboardingCardProps) {
  const { t } = useTranslation('conversation');
  const headingId = useId();
  const parsed = parseLearningGoal(initialGoal, testVersion);
  // A hand-written "Other" goal has no category to select. The safe default
  // is All focus areas; saving the learner's new choice replaces it only
  // after they press Continue.
  const [selectedIds, setSelectedIds] = useState<string[]>(parsed.selectedIds);
  const [allFocusAreas, setAllFocusAreas] = useState(
    parsed.selectedIds.length === 0 ? true : parsed.allFocusAreas,
  );
  const categories = getFocusCategories(testVersion);
  const description = mode === 'practice'
    ? t('workspace.center.focusOnboarding.practiceDescription')
    : t('workspace.center.focusOnboarding.studyDescription');

  const handleChange = (selection: FocusAreaSelection) => {
    setSelectedIds(selection.selectedIds);
    setAllFocusAreas(selection.allFocusAreas);
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-xl rounded-2xl border border-immigo-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5"
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-art-blue-50 text-art-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
          <Target className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-bold text-deep-navy dark:text-white">
            {t('workspace.center.focusOnboarding.title')}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-immigo-gray-600 dark:text-gray-300">
            {description}
          </p>
        </div>
      </div>

      <FocusAreaCombobox
        categories={categories}
        selectedIds={selectedIds}
        allFocusAreas={allFocusAreas}
        onChange={handleChange}
        label={t('workspace.right.focusLabel')}
        allLabel={t('workspace.right.allFocusAreas')}
        searchPlaceholder={t('workspace.right.focusSearchPlaceholder')}
        noResultsLabel={t('workspace.right.focusNoResults')}
        limitLabel={count => t('workspace.right.focusLimit', {
          count,
          max: MAX_FOCUS_CATEGORIES,
        })}
        disabled={submitting}
        idPrefix={`focus-onboarding-${mode}`}
      />

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-art-red-700 dark:text-art-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => onSubmit({ selectedIds, allFocusAreas })}
        disabled={submitting}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-art-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-art-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-art-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-art-blue-600 dark:hover:bg-art-blue-500"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitting
          ? t('workspace.center.focusOnboarding.submitting')
          : t('workspace.center.focusOnboarding.continue')}
      </button>
    </section>
  );
}
