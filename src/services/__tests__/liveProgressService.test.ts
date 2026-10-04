// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computeLiveStats } from '../liveProgressService';

describe('computeLiveStats', () => {
  it('returns all zeros / empty for no answers yet', () => {
    const stats = computeLiveStats([]);
    expect(stats).toEqual({
      answered: 0, correct: 0, incorrect: 0, partial: 0, accuracyPct: 0, missedItemIds: [],
    });
  });

  it('computes counts and accuracy correctly for a mix of verdicts', () => {
    const stats = computeLiveStats([
      { item_id: 'q1', verdict: 'correct' },
      { item_id: 'q2', verdict: 'correct' },
      { item_id: 'q3', verdict: 'incorrect' },
      { item_id: 'q4', verdict: 'partial' },
    ]);
    expect(stats.answered).toBe(4);
    expect(stats.correct).toBe(2);
    expect(stats.incorrect).toBe(1);
    expect(stats.partial).toBe(1);
    expect(stats.accuracyPct).toBe(50); // 2/4
  });

  it('lists missed items as everything that is NOT correct', () => {
    const stats = computeLiveStats([
      { item_id: 'q1', verdict: 'correct' },
      { item_id: 'q2', verdict: 'incorrect' },
      { item_id: 'q3', verdict: 'partial' },
    ]);
    expect(stats.missedItemIds).toEqual(['q2', 'q3']);
  });

  it('rounds accuracy sensibly for non-exact fractions', () => {
    const stats = computeLiveStats([
      { item_id: 'q1', verdict: 'correct' },
      { item_id: 'q2', verdict: 'correct' },
      { item_id: 'q3', verdict: 'incorrect' },
    ]);
    expect(stats.accuracyPct).toBe(67); // 2/3 = 66.67 -> rounds to 67
  });

  it('a perfect run is 100%, an all-wrong run is 0%', () => {
    expect(computeLiveStats([{ item_id: 'q1', verdict: 'correct' }]).accuracyPct).toBe(100);
    expect(computeLiveStats([{ item_id: 'q1', verdict: 'incorrect' }]).accuracyPct).toBe(0);
  });
});
