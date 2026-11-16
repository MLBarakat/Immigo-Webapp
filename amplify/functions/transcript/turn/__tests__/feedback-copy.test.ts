// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  feedbackFallback,
  practiceFirstQuestion,
  questionTransition,
} from '../feedback-copy';
import type { OnboardingLanguage } from '../mode-onboarding';

const languages: OnboardingLanguage[] = ['en-US', 'es-ES', 'fr-FR', 'ar-SA'];

describe('feedbackFallback (F11 verdict-aware fallbacks)', () => {
  it('teaches the first acceptable answer for a Standard incorrect answer', () => {
    expect(feedbackFallback({
      verdict: 'incorrect',
      mode: 'standard',
      answer: 'Freedom of speech',
      language: 'en-US',
    })).toBe("One correct answer is Freedom of speech. Let's continue.");
  });

  it('uses the Study review line instead of duplicating the answer list', () => {
    const copy = feedbackFallback({
      verdict: 'incorrect',
      mode: 'study',
      answer: 'Freedom of speech',
      language: 'en-US',
    });
    expect(copy).toBe("Good effort. Let's review the answer.");
    expect(copy).not.toContain('Freedom of speech');
  });

  it('uses the dynamic fallback when no acceptable answer is available', () => {
    expect(feedbackFallback({
      verdict: 'incorrect',
      mode: 'standard',
      answer: null,
      language: 'en-US',
    })).toBe("Thanks for your answer. Let's continue.");
  });

  it('uses a distinct line for correct and partial verdicts', () => {
    expect(feedbackFallback({ verdict: 'correct', mode: 'standard', language: 'en-US' }))
      .toBe("That's correct. Let's continue.");
    expect(feedbackFallback({ verdict: 'partial', mode: 'standard', language: 'en-US' }))
      .toBe("Good start. Let's continue.");
    expect(feedbackFallback({ verdict: null, mode: 'standard', language: 'en-US' }))
      .toBe("Thanks for your answer. Let's continue.");
  });

  it('localizes every fallback in all four supported locales', () => {
    const english = feedbackFallback({
      verdict: 'incorrect', mode: 'standard', answer: 'Republic', language: 'en-US',
    });
    for (const language of languages) {
      const copy = feedbackFallback({
        verdict: 'incorrect', mode: 'standard', answer: 'Republic', language,
      });
      expect(copy.length).toBeGreaterThan(0);
      expect(copy).toContain('Republic');
      if (language !== 'en-US') expect(copy).not.toBe(english);
      if (language === 'ar-SA') expect(copy).toMatch(/[\u0600-\u06FF]/);
    }
  });
});

describe('questionTransition (F11 mode-specific lead-ins)', () => {
  it('keeps the Standard lead-in fixed and the official question in English', () => {
    expect(questionTransition('standard', { id: 'q-001', question: 'What is the capital?' }, 'en-US'))
      .toBe('Next question: What is the capital?');
    expect(questionTransition('standard', { id: 'q-001', question: 'What is the capital?' }, 'es-ES'))
      .toBe('Siguiente pregunta: What is the capital?');
  });

  it('rotates Practice between two stable variants chosen by question id', () => {
    const first = questionTransition('practice', { id: 'q-a', question: 'Question?' }, 'en-US');
    const second = questionTransition('practice', { id: 'q-b', question: 'Question?' }, 'en-US');

    expect(first).toBe('Next one: Question?');
    expect(second).toBe("Here's the next one: Question?");
    expect(questionTransition('practice', { id: 'q-a', question: 'Question?' }, 'en-US')).toBe(first);
  });

  it('localizes the Practice lead-ins without translating the question', () => {
    const copy = questionTransition('practice', { id: 'q-a', question: 'What is the capital?' }, 'fr-FR');
    expect(copy).toMatch(/^(La suivante|Voici la suivante) : What is the capital\?$/);
  });
});

describe('practiceFirstQuestion (F5 localized Practice framing)', () => {
  it('localizes the first-question prefix and keeps the question English', () => {
    expect(practiceFirstQuestion('What is the capital?', 'en-US'))
      .toBe('The first question is: What is the capital?');
    expect(practiceFirstQuestion('What is the capital?', 'es-ES'))
      .toBe('La primera pregunta es: What is the capital?');
    expect(practiceFirstQuestion('What is the capital?', 'ar-SA'))
      .toMatch(/^السؤال الأول هو: What is the capital\?$/);
  });
});
