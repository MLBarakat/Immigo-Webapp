// amplify/functions/transcript/turn/feedback-copy.ts
// Verdict-aware fallbacks and localized question transitions (F11).
//
// Every string here is resolved through the typed four-locale server copy
// catalog. Exam content — the official USCIS question — is always passed
// through untranslated so the learner sees the real English question.

import { serverCopy, type ServerCopyKey } from './server-copy';
import type { OnboardingLanguage } from './mode-onboarding';
import type { SimulationMode } from './types';

export type FeedbackVerdict = 'correct' | 'incorrect' | 'partial' | null;
/** A committed verdict (never null) used for the text prefix and UI badge. */
export type CommittedVerdict = Exclude<FeedbackVerdict, null>;

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
 *   - Standard/Practice with a number: localized "Question no. {number}:".
 *   - Practice without a number: two stable variants rotated by question id.
 *   - Study: no transition; Study formats its own numbered question block.
 */
export function questionTransition(
  mode: SimulationMode | undefined,
  question: TransitionQuestion,
  language: OnboardingLanguage,
  questionNumber?: number,
): string {
  if (questionNumber !== undefined) {
    const label = serverCopy('questionNumberLabel', language).replace('{number}', String(questionNumber));
    return `${label} ${question.question}`;
  }

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

const VERDICT_COPY_KEYS: Readonly<Record<SimulationMode, Readonly<Record<CommittedVerdict, ServerCopyKey>>>> = {
  standard: {
    correct: 'verdictStandardCorrect',
    incorrect: 'verdictStandardIncorrect',
    partial: 'verdictStandardPartial',
  },
  practice: {
    correct: 'verdictPracticeCorrect',
    incorrect: 'verdictPracticeIncorrect',
    partial: 'verdictPracticePartial',
  },
  study: {
    correct: 'verdictStudyCorrect',
    incorrect: 'verdictStudyIncorrect',
    partial: 'verdictStudyPartial',
  },
};

/**
 * Leading model acknowledgments that duplicate the deterministic verdict
 * prefix. They are stripped once, then the prefix is added, so a reply can
 * never open with "That's correct. Correct. ...". The lists stay short and
 * literal: they cover the openings the model actually produces, not every
 * possible praise word.
 */
const LEADING_ACKNOWLEDGMENT: Readonly<Record<OnboardingLanguage, RegExp>> = {
  'en-US': /^(?:that['’]s\s+(?:correct|right)|correct|incorrect|right|wrong|exactly|well\s+done|great\s+job|good\s+job|nice\s+work|not\s+quite(?:\s+right)?|not\s+exactly|almost(?:\s+there)?|good\s+start|good\s+effort|partially\s+correct|partly\s+correct)[\s!.,;:—–-]*/i,
  'es-ES': /^(?:es\s+correct[oa]|correct[oa]|incorrect[oa]|exacto|muy\s+bien|buen\s+trabajo|bien\s+hecho|casi(?:\s+lo\s+tienes)?|no\s+es\s+del\s+todo\s+correcto|no\s+exactamente|buen\s+comienzo|parcialmente\s+correcto)[\s!.,;:—–-]*/i,
  'fr-FR': /^(?:c['’]est\s+(?:correct|exact)|bonne\s+réponse|réponse\s+incorrecte|correct|incorrect|exactement|très\s+bien|bon\s+travail|bien\s+joué|presque|pas\s+tout\s+à\s+fait(?:\s+exact)?|bon\s+début|partiellement\s+correct)[\s!.,;:—–-]*/i,
  'ar-SA': /^(?:هذا\s+صحيح|إجابة\s+صحيحة|صحيحة|صحيح|أحسنت|عمل\s+جيد|ممتاز|ليس\s+تمامًا|ليس\s+صحيحًا\s+تمامًا|تقريبًا|بداية\s+جيدة)[\s!.,;:،؛—–-]*/u,
};

function capitalizeFirstLetter(text: string, language: OnboardingLanguage): string {
  if (!text || language === 'ar-SA') return text;
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1);
}

/**
 * Prefix committed civics feedback with the deterministic, mode-specific
 * verdict so the chat text always agrees with the UI badge.
 *
 * Only a "correct" verdict gets a leading verdict word ("Correct.").
 * Incorrect and partial verdicts never start with a verdict label — the
 * feedback body stands alone so learners are not bluntly told "Incorrect."
 * Non-committed feedback (retry, hint, clarification) passes through untouched.
 */
export function applyVerdictPrefix(
  feedback: string,
  verdict: FeedbackVerdict,
  mode: SimulationMode | undefined,
  language: OnboardingLanguage,
): string {
  const body = feedback.trim();
  if (!verdict) return body;

  // Only "correct" carries a leading verdict word. Incorrect/partial stand alone.
  if (verdict !== 'correct') return body;

  const effectiveMode: SimulationMode = mode ?? 'standard';
  const prefix = serverCopy(VERDICT_COPY_KEYS[effectiveMode][verdict], language);
  if (!body) return prefix;

  const acknowledgment = LEADING_ACKNOWLEDGMENT[language];
  let remainder = body;
  while (acknowledgment.test(remainder)) {
    remainder = remainder.replace(acknowledgment, '').trim();
  }
  return remainder
    ? `${prefix} ${capitalizeFirstLetter(remainder, language)}`
    : prefix;
}
