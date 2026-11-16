// amplify/functions/transcript/turn/feedback-copy.ts
// Verdict-aware fallbacks and localized question transitions (F11).
//
// Every string here is resolved through the typed four-locale server copy
// catalog. Exam content — the official USCIS question — is always passed
// through untranslated so the learner sees the real English question.

import { serverCopy } from './server-copy';
import type { OnboardingLanguage } from './mode-onboarding';
import type { SimulationMode } from './types';

export type FeedbackVerdict = 'correct' | 'incorrect' | 'partial' | null;

export interface FeedbackFallbackInput {
  /** The grade committed for the turn, or null when nothing was graded. */
  verdict: FeedbackVerdict;
  mode: SimulationMode;
  language: OnboardingLanguage;
  /** One acceptable answer, when the asked item has one available. */
  answer?: string | null;
}

/**
 * Deterministic copy used when the model's feedback sanitizes to nothing.
 * The fallback teaches an answer for Standard/Practice incorrect turns and
 * never invents a score or repeats a Study answer list.
 */
export function feedbackFallback(input: FeedbackFallbackInput): string {
  const { verdict, mode, language, answer } = input;

  if (verdict === 'correct') {
    return serverCopy('feedbackCorrect', language);
  }
  if (verdict === 'partial') {
    return serverCopy('feedbackPartial', language);
  }
  if (verdict === 'incorrect') {
    if (mode === 'study') {
      return serverCopy('studyFeedbackIncorrect', language);
    }
    const acceptable = answer?.trim();
    if (acceptable) {
      return serverCopy('feedbackIncorrect', language).replace('{answer}', acceptable);
    }
  }
  return serverCopy('feedbackDynamic', language);
}

export interface TransitionQuestion {
  id: string;
  question: string;
}

/**
 * Stable Practice variant chosen by the question id. Parity is enough to
 * rotate two lead-ins while keeping the same question on the same variant
 * across turns, processes, and sessions.
 */
function practiceVariant(id: string): 'practiceNextOne' | 'practiceNextHere' {
  let parity = 0;
  for (let index = 0; index < id.length; index += 1) {
    parity = (parity * 31 + id.charCodeAt(index)) % 2;
  }
  return parity === 1 ? 'practiceNextOne' : 'practiceNextHere';
}

/**
 * Lead-in for the next official question.
 *   - Standard: one fixed, localized transition.
 *   - Practice: two stable variants rotated by question id.
 *   - Study: no transition; Study formats its own question block.
 */
export function questionTransition(
  mode: SimulationMode | undefined,
  question: TransitionQuestion,
  language: OnboardingLanguage,
): string {
  if (mode === 'practice') {
    return `${serverCopy(practiceVariant(question.id), language)} ${question.question}`;
  }
  if (mode === 'study') {
    return question.question;
  }
  return `${serverCopy('standardNextQuestion', language)} ${question.question}`;
}

/** Localized first-question framing for Practice. The question stays English. */
export function practiceFirstQuestion(question: string, language: OnboardingLanguage): string {
  return `${serverCopy('practiceFirstQuestion', language)} ${question}`;
}
