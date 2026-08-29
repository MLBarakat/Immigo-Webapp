// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { wordErrorRate, normalizeForWer } from '../wer';

describe('normalizeForWer', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeForWer('The,  U.S.  Constitution!')).toBe('the u s constitution');
  });
});

describe('wordErrorRate', () => {
  it('is 0 for an exact match after normalization', () => {
    expect(wordErrorRate('One hundred senators', 'one hundred, senators!').wer).toBe(0);
  });

  it('counts one substitution', () => {
    const r = wordErrorRate('the president is elected', 'the premier is elected');
    expect(r.substitutions).toBe(1);
    expect(r.wer).toBeCloseTo(1 / 4, 5);
  });

  it('counts a deletion', () => {
    expect(wordErrorRate('a b c d', 'a c d').deletions).toBe(1);
  });

  it('counts an insertion', () => {
    expect(wordErrorRate('a b c', 'a b c d').insertions).toBe(1);
  });

  it('empty hypothesis vs non-empty reference is WER 1', () => {
    expect(wordErrorRate('two words', '').wer).toBe(1);
  });

  it('empty reference and empty hypothesis is WER 0', () => {
    expect(wordErrorRate('', '').wer).toBe(0);
  });
});
