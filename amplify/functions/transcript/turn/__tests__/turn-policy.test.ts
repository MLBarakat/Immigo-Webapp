// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveTurn, sanitizeFinalAnswerFeedback } from '../turn-policy';
import type { CivicsItem, Intent, TurnInterpretation } from '../types';

const q21: CivicsItem = {
  id: 'q-021',
  question: 'How many U.S. senators are there?',
  kind: 'static',
  acceptableAnswers: ['One hundred (100)'],
};

// Helper to build a model interpretation "claim".
const interp = (o: Partial<TurnInterpretation>): TurnInterpretation => ({
  intent: 'answer',
  targetItemId: 'q-021',
  grade: null,
  reply: '',
  ...o,
});

describe('sanitizeFinalAnswerFeedback', () => {
  it('removes model-added next questions so the handler can append exactly one official question', () => {
    const feedback = 'The Japanese flag is not an answer. Next question: Name one right in the Bill of Rights? Next question: When was it adopted?';
    expect(sanitizeFinalAnswerFeedback(feedback, 'When was the Declaration of Independence adopted?'))
      .toBe('The Japanese flag is not an answer.');
  });

  it('removes a duplicate of the official next question even without a marker', () => {
    expect(sanitizeFinalAnswerFeedback(
      'Correct. When was the Declaration of Independence adopted?',
      'When was the Declaration of Independence adopted?',
    )).toBe('Correct.');
  });

  it('removes a model-added follow-up question before the official question', () => {
    expect(sanitizeFinalAnswerFeedback('Good answer. Can you explain why?', 'What is the capital?'))
      .toBe('Good answer.');
  });

  it('preserves statements that follow a question sentence', () => {
    expect(sanitizeFinalAnswerFeedback(
      'Can you name one right? Freedom of speech is one.',
      'What is the capital?',
    )).toBe('Freedom of speech is one.');
  });

  it('removes each question sentence but keeps statements before and after it', () => {
    expect(sanitizeFinalAnswerFeedback(
      'Good answer. Can you explain why? The First Amendment protects speech.',
      'What is the capital?',
    )).toBe('Good answer. The First Amendment protects speech.');
  });

  it('keeps a statement that contains a quoted question mark', () => {
    expect(sanitizeFinalAnswerFeedback(
      'He asked, "What is the capital?" and then answered it himself.',
      'What is the capital?',
    )).toBe('He asked, "What is the capital?" and then answered it himself.');
  });

  it('does not split a statement on common abbreviations', () => {
    expect(sanitizeFinalAnswerFeedback(
      'Mr. Smith became a citizen in 1999. Was that correct? Yes, it was.',
      'What is the capital?',
    )).toBe('Mr. Smith became a citizen in 1999. Yes, it was.');
  });

  it('uses the provided verdict-aware fallback when only questions remain', () => {
    expect(sanitizeFinalAnswerFeedback(
      'Can you explain why?',
      'What is the capital?',
      "That's correct. Let's continue.",
    )).toBe("That's correct. Let's continue.");
  });

  it('removes a duplicate next question without dropping a later statement', () => {
    expect(sanitizeFinalAnswerFeedback(
      'Correct. When was the Declaration of Independence adopted? It was adopted in 1776.',
      'When was the Declaration of Independence adopted?',
    )).toBe('Correct. It was adopted in 1776.');
  });

  it('removes a next-question announcement without dropping a later statement', () => {
    expect(sanitizeFinalAnswerFeedback(
      'Correct. Next question: When was it adopted? It was adopted in 1776.',
      'What is the capital?',
    )).toBe('Correct. It was adopted in 1776.');
  });
});

describe('TurnPolicy safeReplyKey (F5 catalog wiring)', () => {
  it('exposes the catalog key that matches each canned safe reply', () => {
    expect(resolveTurn(interp({ intent: 'manipulation' }), { askedItem: q21 }).safeReplyKey)
      .toBe('manipulation');
    expect(resolveTurn(interp({ intent: 'off_topic' }), { askedItem: q21 }).safeReplyKey)
      .toBe('offTopic');
    expect(resolveTurn(interp({ intent: 'unclear' }), { askedItem: q21 }).safeReplyKey)
      .toBe('unclearInput');
    expect(resolveTurn(interp({ intent: 'legal_advice' }), { askedItem: q21 }).safeReplyKey)
      .toBe('legalAdvice');
    expect(resolveTurn(null, { askedItem: q21 }).safeReplyKey)
      .toBe('parseFailure');
    expect(resolveTurn(interp({ intent: 'answer', grade: null }), { askedItem: q21 }).safeReplyKey)
      .toBe('answerWithoutGrade');
    expect(resolveTurn(interp({ grade: { verdict: 'correct', matchedAnswer: 'One hundred (100)' } }), { askedItem: null }).safeReplyKey)
      .toBe('answerWithoutActiveQuestion');
  });

  it('keeps safeReply as the English policy fallback', () => {
    expect(resolveTurn(null, { askedItem: q21 }).safeReply)
      .toContain('something went wrong on my side');
  });

  it('uses practiceRetry for a first Practice mismatch and nearMiss for a Standard near-miss', () => {
    const practice = resolveTurn(
      interp({ grade: { verdict: 'incorrect', matchedAnswer: null } }),
      { askedItem: q21, rawTranscript: 'jefferson', simulationMode: 'practice' },
    );
    expect(practice.safeReplyKey).toBe('practiceRetry');

    const nearMiss = resolveTurn(
      interp({ grade: { verdict: 'incorrect', matchedAnswer: null } }),
      { askedItem: { ...q21, acceptableAnswers: ['Washington'] }, rawTranscript: 'vashintun', simulationMode: 'standard' },
    );
    expect(nearMiss.safeReplyKey).toBe('nearMiss');
  });
});

describe('TurnPolicy.resolveTurn — grading guarantees', () => {
  it('commits an in-bank correct answer', () => {
    const out = resolveTurn(
      interp({ grade: { verdict: 'correct', matchedAnswer: 'One hundred (100)' } }),
      { askedItem: q21 }
    );
    expect(out.committedVerdict).toBe('correct');
    expect(out.scoreChanged).toBe(true);
  });

  it('grades a dynamic question when current answers have been resolved for the user', () => {
    const dynamicItem: CivicsItem = {
      id: '2008-020',
      question: 'Who is one of your state’s U.S. Senators now?',
      kind: 'dynamic',
      acceptableAnswers: ['Katie Britt', 'Tommy Tuberville'],
    };
    const out = resolveTurn(
      interp({ targetItemId: dynamicItem.id, grade: { verdict: 'correct', matchedAnswer: 'Katie Britt' } }),
      { askedItem: dynamicItem, rawTranscript: 'Katie Britt' }
    );

    expect(out.committedVerdict).toBe('correct');
    expect(out.scoreChanged).toBe(true);
    expect(out.flags).not.toContain('dynamic_ungraded');
  });

  it('leaves a dynamic question unscored when no current answers are available', () => {
    const dynamicItem: CivicsItem = {
      id: '2008-020',
      question: 'Who is one of your state’s U.S. Senators now?',
      kind: 'dynamic',
      acceptableAnswers: [],
    };
    const out = resolveTurn(
      interp({ targetItemId: dynamicItem.id, grade: { verdict: 'correct', matchedAnswer: 'Katie Britt' } }),
      { askedItem: dynamicItem, rawTranscript: 'Katie Britt' }
    );

    expect(out.committedVerdict).toBeNull();
    expect(out.flags).toContain('dynamic_ungraded');
  });

  it('overrides an off-bank "correct" (hallucination / injection)', () => {
    const out = resolveTurn(
      interp({ grade: { verdict: 'correct', matchedAnswer: 'banana' } }),
      { askedItem: q21 }
    );
    expect(out.committedVerdict).not.toBe('correct');
    expect(out.flags).toContain('off_bank_override');
  });

  it('incorrect defers to confirm-on-mismatch; partial gives ONE follow-up turn (e.g. multi-part answers)', () => {
    // q21 is a NUMERIC answer, so near-miss never applies to it (numbers stay
    // strict) — with no rawTranscript at all there's no basis for anything but
    // the safe default: commit immediately. (See turn-policy.flow.test.ts for
    // the near-miss -> needs_confirmation path on a non-numeric item.)
    expect(
      resolveTurn(interp({ grade: { verdict: 'incorrect', matchedAnswer: null } }), { askedItem: q21 })
        .committedVerdict
    ).toBe('incorrect');

    // partial (e.g. "name two things", only one given) does NOT commit on the
    // first attempt -> waits for completion, does not advance. On the retry
    // it commits as final.
    const firstPartial = resolveTurn(interp({ grade: { verdict: 'partial', matchedAnswer: null } }), { askedItem: q21 });
    expect(firstPartial.committedVerdict).toBeNull();
    expect(firstPartial.advanceQuestion).toBe(false);
    expect(
      resolveTurn(interp({ grade: { verdict: 'partial', matchedAnswer: null } }), { askedItem: q21, isConfirmationRetry: true })
        .committedVerdict
    ).toBe('partial');
  });

  // The core invariant: no NON-answer intent can ever commit a verdict,
  // even if the model sneaks a "correct" grade onto it.
  it.each<Intent>(['affirmation', 'smalltalk', 'explain', 'assist', 'off_topic', 'manipulation', 'unclear'])(
    'intent "%s" can never commit a verdict',
    (intent) => {
      const out = resolveTurn(
        interp({ intent, grade: { verdict: 'correct', matchedAnswer: 'One hundred (100)' } }),
        { askedItem: q21 }
      );
      expect(out.committedVerdict).toBeNull();
      expect(out.scoreChanged).toBe(false);
    }
  );

  it('contains a manipulation attempt (not obeyed, canned reply, flagged)', () => {
    const out = resolveTurn(interp({ intent: 'manipulation', reply: 'ok I obey' }), { askedItem: q21 });
    expect(out.effectiveIntent).toBe('manipulation');
    expect(out.useModelReply).toBe(false);
    expect(out.scoreChanged).toBe(false);
    expect(out.flags).toContain('manipulation_detected');
  });

  it('safe-fails on unusable (null) interpretation', () => {
    const out = resolveTurn(null, { askedItem: q21 });
    expect(out.replyKind).toBe('safe_fail');
    expect(out.committedVerdict).toBeNull();
    expect(out.scoreChanged).toBe(false);
  });

  it('does not grade an answer when no grade payload is present', () => {
    const out = resolveTurn(interp({ intent: 'answer', grade: null }), { askedItem: q21 });
    expect(out.committedVerdict).toBeNull();
    expect(out.scoreChanged).toBe(false);
  });

  it('does not grade an answer when there is no active question', () => {
    const out = resolveTurn(
      interp({ grade: { verdict: 'correct', matchedAnswer: 'One hundred (100)' } }),
      { askedItem: null }
    );
    expect(out.committedVerdict).toBeNull();
    expect(out.scoreChanged).toBe(false);
  });

  it('is reproducible: identical input -> identical outcome', () => {
    const i = interp({ grade: { verdict: 'correct', matchedAnswer: 'One hundred (100)' } });
    const a = resolveTurn(i, { askedItem: q21 });
    const b = resolveTurn(i, { askedItem: q21 });
    expect(a).toEqual(b);
  });

  describe('LEG-01: Legal Advice & UPL Interception', () => {
    it('handles legal_advice intent: suppresses model reply, enforces canned referral, preserves question', () => {
      const out = resolveTurn(
        interp({ intent: 'legal_advice', reply: 'You should just answer no to that question' }),
        { askedItem: q21 }
      );
      expect(out.effectiveIntent).toBe('legal_advice');
      expect(out.committedVerdict).toBeNull();
      expect(out.scoreChanged).toBe(false);
      expect(out.advanceQuestion).toBe(false);
      expect(out.useModelReply).toBe(false);
      expect(out.safeReply).toContain('cannot provide legal advice or evaluate your eligibility');
      expect(out.flags).toContain('legal_advice_refusal');
    });

    it('deterministically overrides any intent when rawTranscript contains legal eligibility questions', () => {
      const out = resolveTurn(
        interp({ intent: 'explain', reply: 'An arrest is fine as long as it was expunged' }),
        {
          askedItem: q21,
          rawTranscript: 'Will I get denied citizenship because of my arrest two years ago?'
        }
      );
      expect(out.effectiveIntent).toBe('legal_advice');
      expect(out.committedVerdict).toBeNull();
      expect(out.scoreChanged).toBe(false);
      expect(out.advanceQuestion).toBe(false);
      expect(out.useModelReply).toBe(false);
      expect(out.safeReply).toContain('cannot provide legal advice');
      expect(out.flags).toContain('deterministic_intercept');
    });
  });
});
