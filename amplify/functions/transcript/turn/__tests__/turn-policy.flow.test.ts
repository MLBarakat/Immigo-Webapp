// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveTurn } from '../turn-policy';
import type { CivicsItem, Intent, TurnInterpretation } from '../types';

const q: CivicsItem = {
  id: 'q-cabinet',
  question: 'Name two Cabinet-level positions.',
  kind: 'static',
  acceptableAnswers: ['Secretary of State', 'Secretary of Defense', 'Attorney General'],
};

const interp = (o: Partial<TurnInterpretation>): TurnInterpretation => ({
  intent: 'answer',
  targetItemId: 'q-cabinet',
  grade: null,
  reply: '',
  ...o,
});

describe('repeat intent — literal re-ask, never scores, never advances', () => {
  it('repeats the REAL question text (not the model\'s paraphrase)', () => {
    const out = resolveTurn(
      { intent: 'repeat', targetItemId: 'q-cabinet', grade: null, reply: 'sure, repeating a totally different thing' },
      { askedItem: q }
    );
    expect(out.advanceQuestion).toBe(false);
    expect(out.committedVerdict).toBeNull();
    expect(out.useModelReply).toBe(false); // literal, not model paraphrase
    expect(out.safeReply).toContain(q.question);
  });

  it('falls back safely if there is no active item', () => {
    const out = resolveTurn({ intent: 'repeat', targetItemId: null, grade: null, reply: '' }, { askedItem: null });
    expect(out.advanceQuestion).toBe(false);
    expect(out.committedVerdict).toBeNull();
  });
});

describe('hint intent — dynamic teaching content, never scores, never advances', () => {
  it('trusts the model\'s hint text and stays on the same question', () => {
    const out = resolveTurn(
      { intent: 'hint', targetItemId: 'q-cabinet', grade: null, reply: 'Think about the President\'s advisors.' },
      { askedItem: q }
    );
    expect(out.advanceQuestion).toBe(false);
    expect(out.committedVerdict).toBeNull();
    expect(out.useModelReply).toBe(true);
    expect(out.safeReply).toBe("Think about the President's advisors.");
  });
});

describe('advanceQuestion contract — the fix for "bulldozes forward regardless of intent"', () => {
  it.each<Intent>(['explain', 'assist', 'affirmation', 'smalltalk', 'off_topic', 'manipulation', 'unclear', 'repeat', 'hint'])(
    'intent "%s" NEVER advances the question',
    (intent) => {
      const out = resolveTurn(interp({ intent, reply: 'anything' }), { askedItem: q });
      expect(out.advanceQuestion).toBe(false);
    }
  );

  it('a genuinely graded FINAL answer (correct/incorrect-far-miss) DOES advance', () => {
    const correct = resolveTurn(
      interp({ grade: { verdict: 'correct', matchedAnswer: 'Secretary of State' } }),
      { askedItem: q }
    );
    expect(correct.advanceQuestion).toBe(true);

    const farMiss = resolveTurn(
      interp({ grade: { verdict: 'incorrect', matchedAnswer: null } }),
      { askedItem: q, rawTranscript: 'the weather is nice today' }
    );
    expect(farMiss.advanceQuestion).toBe(true);
  });

  it('a needs_confirmation or in-progress partial does NOT advance', () => {
    const nearMiss = resolveTurn(
      interp({ grade: { verdict: 'incorrect', matchedAnswer: null } }),
      { askedItem: q, rawTranscript: 'secretary of stait' } // close, verified near-miss
    );
    expect(nearMiss.replyKind).toBe('needs_confirmation');
    expect(nearMiss.advanceQuestion).toBe(false);

    const partial = resolveTurn(
      interp({ grade: { verdict: 'partial', matchedAnswer: null } }),
      { askedItem: q, rawTranscript: 'i think one of them is the secretary' } // doesn't fully match any answer
    );
    expect(partial.advanceQuestion).toBe(false);
  });
});
