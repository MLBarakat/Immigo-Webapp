// amplify/functions/transcript/turn/mode-onboarding.ts
// Deterministic Practice/Study onboarding copy.
//
// The mode transition is a product decision point, not a conversation: the
// learner must see the same explanation and the same progress counts every
// time, in their language, without an LLM deciding what to say. This module
// keeps that copy pure and testable.

import type { SimulationMode, TestVersion } from './types';
import { serverCopy, serverCopyTemplate } from './server-copy';

export type OnboardingLanguage = 'en-US' | 'es-ES' | 'fr-FR' | 'ar-SA';

/** English display name used inside model prompts for each supported locale. */
export const LANGUAGE_PROMPT_NAMES: Record<OnboardingLanguage, string> = {
  'en-US': 'English',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'ar-SA': 'Arabic',
};

export interface ModeProgressCounts {
  mastered: number;
  practicedNotMastered: number;
  notPracticed: number;
}

export interface ModeOnboardingStats {
  overall: ModeProgressCounts;
  focus: ModeProgressCounts;
  focusLabels: string[];
  allFocusAreas: boolean;
}

const SUPPORTED_LANGUAGES: readonly OnboardingLanguage[] = ['en-US', 'es-ES', 'fr-FR', 'ar-SA'];

function isOnboardingLanguage(value: string | null | undefined): value is OnboardingLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function focusList(labels: readonly string[], language: OnboardingLanguage): string {
  return labels.join(language === 'ar-SA' ? '، ' : ', ');
}

export function localizedAllFocusLabel(language: OnboardingLanguage): string {
  return serverCopy('allFocusAreasLabel', language);
}

/** The first-time explanation shown before the focus card. */
export function buildFirstTimeOnboarding(
  mode: 'practice' | 'study',
  language: OnboardingLanguage,
): string {
  return serverCopy(mode === 'practice' ? 'modeFirstTimePractice' : 'modeFirstTimeStudy', language);
}

/** The explicit confirmation step after the learner chooses Ready. */
export function buildModeReadyPrompt(
  mode: 'practice' | 'study',
  language: OnboardingLanguage,
): string {
  return serverCopy(mode === 'practice' ? 'modeReadyPractice' : 'modeReadyStudy', language);
}

/** The returning explanation with overall counts and the current focus subset. */
export function buildReturningOnboarding(
  mode: 'practice' | 'study',
  testVersion: TestVersion,
  stats: ModeOnboardingStats,
  language: OnboardingLanguage,
  options: { readyGate?: boolean } = {},
): string {
  const { overall, focus, focusLabels, allFocusAreas } = stats;
  const readyGate = options.readyGate === true;
  const focusLabel = focusList(focusLabels, language);
  const introKey = mode === 'practice' ? 'modeReturningPractice' : 'modeReturningStudy';
  const intro = serverCopyTemplate(introKey, language, {
    version: testVersion,
    mastered: overall.mastered,
    practiced: overall.practicedNotMastered,
    notPracticed: overall.notPracticed,
  });
  const focusLine = allFocusAreas
    ? serverCopy('modeReturningAllFocus', language)
    : serverCopyTemplate('modeReturningFocus', language, {
      focus: focusLabel,
      mastered: focus.mastered,
      practiced: focus.practicedNotMastered,
      notPracticed: focus.notPracticed,
    });
  let closing: string;
  if (readyGate) {
    const saved = allFocusAreas
      ? serverCopy('modeSavedAllFocus', language)
      : serverCopyTemplate('modeSavedFocus', language, { focus: focusLabel });
    closing = `${saved} ${serverCopy('modeReadyGateSuffix', language)}`;
  } else {
    closing = serverCopy(allFocusAreas ? 'modeKeepAllFocus' : 'modeKeepFocus', language);
  }
  return [intro, focusLine, closing].join(' ');
}

/** Confirmation after the learner chooses a focus and presses Continue. */
export function buildFocusConfirmation(
  mode: 'practice' | 'study',
  allFocusAreas: boolean,
  focusLabels: string[],
  language: OnboardingLanguage,
): string {
  const focus = allFocusAreas
    ? localizedAllFocusLabel(language)
    : focusList(focusLabels, language);
  return serverCopyTemplate('modeFocusConfirmation', language, {
    focus,
    mode: modeLabel(mode, language),
  });
}

/** Shown when a focus pool has just completed a full pass. */
export function buildCycleNotice(language: OnboardingLanguage): string {
  return serverCopy('modeCycleNotice', language);
}

export function modeLabel(
  mode: Exclude<SimulationMode, 'standard'>,
  language: OnboardingLanguage,
): string {
  return serverCopy(mode === 'practice' ? 'modePracticeLabel' : 'modeStudyLabel', language);
}

/** Shared rule: below 60% accuracy recommends guided review, at/above recommends practice. */
export function recommendLearningMode(accuracyPercent: number): 'practice' | 'study' {
  return accuracyPercent < 60 ? 'study' : 'practice';
}

const RECOMMENDATION_KEYS = {
  practice: 'recommendationPractice',
  study: 'recommendationStudy',
} as const;

/** Localized reason for the recommended mode, shown in the report fallback. */
export function recommendationReason(mode: 'practice' | 'study', language?: string | null): string {
  const lng = isOnboardingLanguage(language) ? language : 'en-US';
  return serverCopy(RECOMMENDATION_KEYS[mode], lng);
}

/** Deterministic acknowledgement when the learner switches to Standard. */
export function buildStandardModeSwitchCopy(language: OnboardingLanguage): string {
  return serverCopy('standardModeSwitch', language);
}
