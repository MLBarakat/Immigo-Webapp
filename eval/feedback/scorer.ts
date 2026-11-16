import { feedbackFallback } from '../../amplify/functions/transcript/turn/feedback-copy';
import { sanitizeFinalAnswerFeedback } from '../../amplify/functions/transcript/turn/turn-policy';
import type { FeedbackEvalCase, FeedbackEvalResult } from './types';

function normalizeForComparison(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[?.!]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic feedback scorer for the F11 golden set. It measures the
 * production sanitizer, not live model tone: non-empty, no trailing question
 * sentence, no duplicate next question, and an exact expected statement or
 * verdict-aware fallback.
 */
export function evaluateFeedbackCase(testCase: FeedbackEvalCase): FeedbackEvalResult {
  const fallback = feedbackFallback({
    verdict: testCase.verdict,
    mode: testCase.mode,
    language: testCase.language,
    answer: testCase.answer,
  });
  const actual = sanitizeFinalAnswerFeedback(testCase.rawReply, testCase.nextQuestion, fallback);
  const reasons: string[] = [];

  if (!actual.trim()) reasons.push('feedback is empty');
  if (/\?\s*$/u.test(actual)) reasons.push('feedback ends with a question sentence');

  const nextQuestion = normalizeForComparison(testCase.nextQuestion);
  if (nextQuestion && normalizeForComparison(actual).includes(nextQuestion)) {
    reasons.push('feedback repeats the official next question');
  }

  if (actual !== testCase.expected) {
    reasons.push(`expected "${testCase.expected}", received "${actual}"`);
  }

  return { testCase, actual, passed: reasons.length === 0, reasons };
}

export function evaluateFeedbackCases(cases: readonly FeedbackEvalCase[]): FeedbackEvalResult[] {
  return cases.map(evaluateFeedbackCase);
}
