// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveTurn } from '../turn-policy';
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

describe('TurnPolicy.resolveTurn — grading guarantees', () => {
  it('commits an in-bank correct answer', () => {
    const out = resolveTurn(
      interp({ grade: { verdict: 'correct', matchedAnswer: 'One hundred (100)' } }),
      { askedItem: q21 }
    );
    expect(out.committedVerdict).toBe('correct');
    expect(out.scoreChanged).toBe(true);
  });

  it('overrides an off-bank "correct" (hallucination / injection)', () => {
    const out = resolveTurn(
      interp({ grade: { verdict: 'correct', matchedAnswer: 'banana' } }),
      { askedItem: q21 }
    );
    expect(out.committedVerdict).not.toBe('correct');
    expect(out.flags).toContain('off_bank_override');
  });

  it('honors incorrect / partial verdicts as-is', () => {
    expect(
      resolveTurn(interp({ grade: { verdict: 'incorrect', matchedAnswer: null } }), { askedItem: q21 })
        .committedVerdict
    ).toBe('incorrect');
    expect(
      resolveTurn(interp({ grade: { verdict: 'partial', matchedAnswer: null } }), { askedItem: q21 })
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
});
