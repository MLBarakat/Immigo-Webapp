import { describe, expect, it } from 'vitest';
import cases from '../feedback-cases.json';
import { evaluateFeedbackCase } from '../scorer';
import type { FeedbackEvalCase } from '../types';

const goldenSet = cases as readonly FeedbackEvalCase[];

describe('feedback synthetic golden set (F11)', () => {
  it.each(goldenSet)('$name — $note', (testCase) => {
    const result = evaluateFeedbackCase(testCase);
    expect(result.reasons).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('covers every verdict, mode-specific Study fallback, and all four locales', () => {
    expect(new Set(goldenSet.map((c) => c.verdict))).toEqual(
      new Set(['correct', 'incorrect', 'partial', null]),
    );
    expect(goldenSet.some((c) => c.mode === 'study' && c.verdict === 'incorrect')).toBe(true);
    expect(new Set(goldenSet.map((c) => c.language))).toEqual(
      new Set(['en-US', 'es-ES', 'fr-FR', 'ar-SA']),
    );
  });

  it('contains no real PII in its fixtures', () => {
    const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const phone = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
    const ssn = /\b\d{3}-\d{2}-\d{4}\b/;
    for (const testCase of goldenSet) {
      const fixture = `${testCase.rawReply}\n${testCase.nextQuestion}\n${testCase.expected}`;
      expect(fixture).not.toMatch(email);
      expect(fixture).not.toMatch(phone);
      expect(fixture).not.toMatch(ssn);
    }
  });
});
