// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { US_STATES } from '../../../../../src/utils/usLocation';
import { allItems, getItem } from '../bank';
import { getDynamicAnswers, withDynamicAnswers } from '../dynamic-answers';
import { answerInBank } from '../matching';
import { buildTurnPrompt } from '../turn-interpreter';
import { resolveTurn } from '../turn-policy';
import type { TurnInterpretation } from '../types';

const answerInterpretation = (matchedAnswer: string): TurnInterpretation => ({
  intent: 'answer',
  targetItemId: 'q-023',
  grade: { verdict: 'correct', matchedAnswer },
  reply: 'That is correct.',
});

describe('dynamic civics answers', () => {
  it('resolves every dynamic item in both test versions', () => {
    const items = [...allItems('2008'), ...allItems('2020')].filter((item) => item.kind === 'dynamic');

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(getDynamicAnswers(item.id, 'AL'), item.id).not.toHaveLength(0);
    }
  });

  it('provides complete state-specific data for every registration state', () => {
    for (const [stateCode] of US_STATES) {
      expect(getDynamicAnswers('2008-020', stateCode)).not.toHaveLength(0);
      expect(getDynamicAnswers('2008-023', stateCode)).not.toHaveLength(0);
      expect(getDynamicAnswers('2008-043', stateCode)).not.toHaveLength(0);
      expect(getDynamicAnswers('2008-044', stateCode)).not.toHaveLength(0);
    }
  });

  it('returns federal answers without requiring a state', () => {
    expect(getDynamicAnswers('2008-028')).toContain('Donald Trump');
    expect(getDynamicAnswers('2008-039')).toContain('nine');
    expect(answerInBank('J.D. Vance', getDynamicAnswers('2008-029'))).toBe(true);
  });

  it('fails closed for missing or unknown state data', () => {
    expect(getDynamicAnswers('q-023')).toEqual([]);
    expect(getDynamicAnswers('q-023', 'XX')).toEqual([]);
    expect(getDynamicAnswers('unknown-question', 'AL')).toEqual([]);
  });

  it('attaches state answers to the bank item without mutating the source bank', () => {
    const bankItem = getItem('q-023');
    expect(bankItem).not.toBeNull();
    expect(bankItem?.acceptableAnswers).toEqual([]);

    const resolved = withDynamicAnswers(bankItem!, 'AL');

    expect(resolved.acceptableAnswers).toContain('Katie Britt');
    expect(bankItem?.acceptableAnswers).toEqual([]);
  });

  it('uses the resolved answers in the interpretation prompt and authoritative score', () => {
    const item = withDynamicAnswers(getItem('q-023')!, 'AL');
    const prompt = buildTurnPrompt({ askedItem: item }, 'Katie Britt');
    const outcome = resolveTurn(answerInterpretation('Katie Britt'), {
      askedItem: item,
      rawTranscript: 'Katie Britt',
    });

    expect(prompt.user).toContain('- Katie Britt');
    expect(outcome.committedVerdict).toBe('correct');
    expect(outcome.scoreChanged).toBe(true);
  });

  it('rejects a senator from another state and leaves missing-state answers unscored', () => {
    const alabamaItem = withDynamicAnswers(getItem('q-023')!, 'AL');
    const wrongStateOutcome = resolveTurn(answerInterpretation('Lisa Murkowski'), {
      askedItem: alabamaItem,
      rawTranscript: 'Lisa Murkowski',
    });
    const noStateItem = withDynamicAnswers(getItem('q-023')!, null);
    const noStateOutcome = resolveTurn(answerInterpretation('Katie Britt'), {
      askedItem: noStateItem,
      rawTranscript: 'Katie Britt',
    });

    expect(wrongStateOutcome.committedVerdict).toBe('incorrect');
    expect(noStateOutcome.committedVerdict).toBeNull();
    expect(noStateOutcome.flags).toContain('dynamic_ungraded');
  });

  it('accepts a current House member from the selected state for either exam edition', () => {
    expect(getDynamicAnswers('2008-023', 'AL')).toContain('Shomari Figures');
    expect(getDynamicAnswers('q-029', 'AL')).toContain('Shomari Figures');
  });
});
