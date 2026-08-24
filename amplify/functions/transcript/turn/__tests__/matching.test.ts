// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalize, answerInBank } from '../matching';

describe('normalize', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalize('The   Constitution!')).toBe('constitution');
  });

  it('rejoins hyphen-split speech artifacts (constit-ution -> constitution)', () => {
    expect(normalize('the Constit-ution')).toBe('constitution');
  });

  it('drops filler tokens', () => {
    expect(normalize('um, the a freedom')).toBe('freedom');
  });
});

describe('answerInBank', () => {
  const answers = ['One hundred (100)'];

  it('accepts an exact match plus case/filler variations', () => {
    expect(answerInBank('one hundred', answers)).toBe(true); // substring of "one hundred 100"
    expect(answerInBank('the Constitution', ['Constitution'])).toBe(true); // "the" filler + case
  });

  it('KNOWN LIMITATION (SAF-01b): substring matcher misses some valid paraphrases', () => {
    // "there are one hundred" is semantically correct, but the bank answer
    // normalizes to "one hundred 100" (from "(100)"), so bidirectional substring
    // matching does not bridge it. Tightening this matcher is tracked as SAF-01b.
    // This test documents the CURRENT behavior; if SAF-01b lands, flip to .toBe(true).
    expect(answerInBank('there are one hundred', answers)).toBe(false);
  });

  it('rejects an off-bank answer', () => {
    expect(answerInBank('two hundred', answers)).toBe(false);
    expect(answerInBank('banana', answers)).toBe(false);
  });

  it('rejects null / empty candidates', () => {
    expect(answerInBank(null, answers)).toBe(false);
    expect(answerInBank('', answers)).toBe(false);
  });

  it('handles multiple acceptable answers', () => {
    expect(answerInBank('religion', ['speech', 'religion', 'press'])).toBe(true);
  });
});
