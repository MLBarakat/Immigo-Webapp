// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { answerInBank, normalize, phoneticKey } from '../matching';

describe('normalize (unchanged behavior)', () => {
  it('lowercases, strips punctuation and filler', () => {
    expect(normalize('The, Constitution!')).toBe('constitution');
  });
});

describe('answerInBank — original exact/substring behavior preserved', () => {
  it('accepts exact and substring matches (regression guard)', () => {
    expect(answerInBank('one hundred', ['One hundred (100)'])).toBe(true);
    expect(answerInBank('the constitution', ['Constitution'])).toBe(true);
    expect(answerInBank(null, ['x'])).toBe(false);
    expect(answerInBank('', ['x'])).toBe(false);
  });
});

describe('answerInBank — ACCENT RECOVERY (should now pass)', () => {
  it('recovers accent-driven phonetic variants of names', () => {
    // "Washington" mangled by accent -> phonetically equivalent.
    expect(answerInBank('warshington', ['Washington'])).toBe(true);
    // v/w confusion, very common for several L1s.
    expect(answerInBank('wilson', ['Wilson'])).toBe(true);
    expect(answerInBank('vilson', ['Wilson'])).toBe(true);
  });

  it('recovers small edit-distance slips on longer words', () => {
    expect(answerInBank('constitushion', ['Constitution'])).toBe(true);
    expect(answerInBank('independance', ['Independence'])).toBe(true);
  });

  it('documents the SAFE conservative boundary: heavy distortion is NOT force-recovered', () => {
    // "linkin" for "lincoln" needs both phonetic AND multi-char tolerance, which
    // our conservative thresholds intentionally do NOT reach — because loosening
    // enough to catch it would also start admitting wrong answers. Per the product
    // decision (prefer a safe fail over a risky pass), this stays strict and is
    // recovered instead by the confirm-on-mismatch re-ask (solution 9), not here.
    expect(answerInBank('abrahem linkin', ['Abraham Lincoln'])).toBe(false);
  });

  it('is answer-anchored: finds the answer inside a filler-padded transcript', () => {
    expect(answerInBank('i think it is washington maybe', ['Washington'])).toBe(true);
    expect(answerInBank('um the answer is the constitution', ['Constitution'])).toBe(true);
  });

  it('recovers a multi-word phrase spoken with an accent', () => {
    expect(answerInBank('freedom of speach', ['freedom of speech'])).toBe(true);
  });
});

describe('answerInBank — ADVERSARIAL false-pass guards (MUST still fail)', () => {
  it('rejects a genuinely different answer that is only loosely similar', () => {
    expect(answerInBank('washington monument', ['Adams'])).toBe(false);
    expect(answerInBank('the president', ['the Constitution'])).toBe(false);
  });

  it('NEVER fuzzy-matches numbers — 92 must not match 99', () => {
    expect(answerInBank('ninety nine', ['ninety two'])).toBe(false);
    expect(answerInBank('99', ['92'])).toBe(false);
    expect(answerInBank('27', ['20'])).toBe(false);
  });

  it('NEVER fuzzy-matches years/dates — 1776 must not match 1786', () => {
    expect(answerInBank('1786', ['1776'])).toBe(false);
    expect(answerInBank('july fourth 1787', ['July 4 1776'])).toBe(false);
  });

  it('rejects short-word near-misses (1-char edit changes meaning)', () => {
    // "war" vs "law" — one edit, but different words; short-word rule = exact only.
    expect(answerInBank('war', ['law'])).toBe(false);
    expect(answerInBank('tax', ['fax'])).toBe(false);
  });

  it('rejects a wrong president whose name is not phonetically the target', () => {
    expect(answerInBank('jefferson', ['Washington'])).toBe(false);
    expect(answerInBank('madison', ['Adams'])).toBe(false);
  });

  it('rejects an unrelated multi-word phrase', () => {
    expect(answerInBank('freedom of the press', ['freedom of religion'])).toBe(false);
  });
});

describe('phoneticKey — sanity', () => {
  it('collapses v/w and vowel variants but keeps distinct words distinct', () => {
    expect(phoneticKey('wilson')).toBe(phoneticKey('vilson'));
    expect(phoneticKey('washington')).not.toBe(phoneticKey('jefferson'));
  });
});
