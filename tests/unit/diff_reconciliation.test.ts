import { describe, it, expect } from 'vitest';
import {
  alignTokenSequences,
  calculateStringSimilarity,
  reconcileTranscripts,
} from '../../src/utils/diffReconciliation';

describe('diffReconciliation text alignment', () => {
  it('calculates a perfect similarity score for identical text', () => {
    expect(calculateStringSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('calculates a low-but-nonzero similarity score for text with only partial overlap', () => {
    const score = calculateStringSimilarity('hello world', 'goodbye moon');

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.2);
  });

  it('returns an empty patch list for blank input strings', () => {
    expect(alignTokenSequences('', '')).toEqual([]);
  });

  it('detects insertions and preserves the stable sequence shape', () => {
    const patches = alignTokenSequences('hello world', 'hello world again');

    expect(patches).toContainEqual(
      expect.objectContaining({
        operation: 'INSERT',
        truthToken: 'again',
      })
    );
  });

  it('detects replacements at the token level', () => {
    const patches = alignTokenSequences('the quick brown fox', 'the swift brown fox');

    expect(patches).toContainEqual(
      expect.objectContaining({
        operation: 'REPLACE',
        speculativeToken: 'quick',
        truthToken: 'swift',
      })
    );
  });

  it('reconcileTranscripts keeps the current text when the similarity lock is engaged', () => {
    const result = reconcileTranscripts('hello world', 'hello world', 0.85);

    expect(result.similarityScore).toBe(1);
    expect(result.uiStabilityLockEngaged).toBe(true);
    expect(result.reconciledText).toBe('hello world');
    expect(result.patches.length).toBeGreaterThan(0);
  });

  it('reconcileTranscripts produces a reconciled text when the lock is disengaged', () => {
    const result = reconcileTranscripts('hello world', 'hello earth', 0.85);

    expect(result.uiStabilityLockEngaged).toBe(false);
    expect(result.reconciledText).toBe('hello earth');
    expect(result.patches.length).toBeGreaterThan(0);
  });
});
