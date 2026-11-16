// amplify/functions/transcript/turn/server-copy.ts
// Typed server copy catalog (F5).
//
// All system/coach voice copy used by the transcript Lambda lives in the
// app locale files (src/i18n/locales/{locale}/conversation.json) under the
// top-level "server" namespace. Those files are the single source of truth
// for every locale; this module only provides typed, locale-aware access.
//
// Exam content (USCIS officer questions, answers, English tasks) stays in
// English; only safety/help/silence/completion and coach voice copy is
// localized.
//
// `safeReplyKey` on `TurnOutcome` references one of these keys, so the
// handler can resolve the localized string at runtime instead of carrying
// inline per-locale objects.

import type { OnboardingLanguage } from './mode-onboarding';
import enUS from '../../../../src/i18n/locales/en-US/conversation.json';
import esES from '../../../../src/i18n/locales/es-ES/conversation.json';
import frFR from '../../../../src/i18n/locales/fr-FR/conversation.json';
import arSA from '../../../../src/i18n/locales/ar-SA/conversation.json';

export type ServerCopyKey = keyof (typeof enUS)['server'];
export type ServerCopyEntry = Readonly<Record<OnboardingLanguage, string>>;

const CATALOGS: Readonly<Record<OnboardingLanguage, Readonly<Record<ServerCopyKey, string>>>> = {
  'en-US': enUS.server,
  'es-ES': esES.server,
  'fr-FR': frFR.server,
  'ar-SA': arSA.server,
};

function entry(key: ServerCopyKey): ServerCopyEntry {
  return {
    'en-US': CATALOGS['en-US'][key],
    'es-ES': CATALOGS['es-ES'][key],
    'fr-FR': CATALOGS['fr-FR'][key],
    'ar-SA': CATALOGS['ar-SA'][key],
  };
}

export const SERVER_COPY: Readonly<Record<ServerCopyKey, ServerCopyEntry>> = {
  legalAdvice: entry('legalAdvice'),
  manipulation: entry('manipulation'),
  clarify: entry('clarify'),
  safeFail: entry('safeFail'),
  offTopic: entry('offTopic'),
  confirm: entry('confirm'),
  practiceRetry: entry('practiceRetry'),
  dynamicAnswer: entry('dynamicAnswer'),
  parseFailure: entry('parseFailure'),
  answerWithoutGrade: entry('answerWithoutGrade'),
  answerWithoutActiveQuestion: entry('answerWithoutActiveQuestion'),
  unclearInput: entry('unclearInput'),
  dynamicUngraded: entry('dynamicUngraded'),
  awaitingConfirmation: entry('awaitingConfirmation'),
  nearMiss: entry('nearMiss'),
  practiceNearMissRetry: entry('practiceNearMissRetry'),
  feedbackCorrect: entry('feedbackCorrect'),
  feedbackIncorrect: entry('feedbackIncorrect'),
  feedbackPartial: entry('feedbackPartial'),
  feedbackDynamic: entry('feedbackDynamic'),
  studyFeedbackIncorrect: entry('studyFeedbackIncorrect'),
  standardNextQuestion: entry('standardNextQuestion'),
  practiceNextOne: entry('practiceNextOne'),
  practiceNextHere: entry('practiceNextHere'),
  practiceFirstQuestion: entry('practiceFirstQuestion'),
  unclearReturnToQuestion: entry('unclearReturnToQuestion'),
  silenceReturnToQuestion: entry('silenceReturnToQuestion'),
  keepGoing: entry('keepGoing'),
};

/** Resolve a localized server copy string by key and language. */
export function serverCopy(key: ServerCopyKey, language: OnboardingLanguage): string {
  return CATALOGS[language][key];
}
