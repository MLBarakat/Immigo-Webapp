// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { scoreStt, type Transcribed } from '../scorer';
import type { SttThresholds } from '../types';

// Bank stub: item q-021 accepts "One hundred (100)".
const bank = new Map<string, string[]>([['q-021', ['One hundred (100)']]]);

const trackWerPolicy: SttThresholds = {
  maxWerPerAccent: null,             // WER tracked-only
  maxWerGap: null,
  maxFalseIncorrectPerAccent: 0.05,  // hard gate on the product harm
};

describe('scoreStt — grade-impact (the product metric)', () => {
  it('passes when STT preserves the grade across accents', () => {
    const rows: Transcribed[] = [
      { audioPath: 'a1', accent: 'Spanish', reference: 'one hundred', itemId: 'q-021', hypothesis: 'one hundred' },
      { audioPath: 'a2', accent: 'Mandarin', reference: 'one hundred', itemId: 'q-021', hypothesis: 'one hundred' },
    ];
    const rep = scoreStt(rows, bank, trackWerPolicy, 'mock');
    expect(rep.gatePassed).toBe(true);
    expect(rep.accents.every((a) => a.falseIncorrect === 0)).toBe(true);
  });

  it('FAILS when one accent has correct answers flipped wrong by STT', () => {
    const rows: Transcribed[] = [
      { audioPath: 's1', accent: 'Spanish', reference: 'one hundred', itemId: 'q-021', hypothesis: 'one hundred' },
      { audioPath: 'v1', accent: 'Vietnamese', reference: 'one hundred', itemId: 'q-021', hypothesis: 'want hundert' },
      { audioPath: 'v2', accent: 'Vietnamese', reference: 'one hundred', itemId: 'q-021', hypothesis: 'one hundred' },
    ];
    const rep = scoreStt(rows, bank, trackWerPolicy, 'mock');
    expect(rep.gatePassed).toBe(false);
    const viet = rep.accents.find((a) => a.accent === 'Vietnamese')!;
    expect(viet.falseIncorrect).toBe(1);
    expect(viet.falseIncorrectRate).toBeCloseTo(0.5, 5);
    expect(rep.failures.some((f) => f.includes('Vietnamese'))).toBe(true);
  });
});

describe('scoreStt — WER lens & fairness gap', () => {
  it('reports a WER gap across accents (tracked-only when no threshold)', () => {
    const rows: Transcribed[] = [
      { audioPath: 'e1', accent: 'Spanish', reference: 'the constitution', hypothesis: 'the constitution' },
      { audioPath: 'e2', accent: 'Arabic', reference: 'the constitution', hypothesis: 'a consumption' },
    ];
    const rep = scoreStt(rows, bank, trackWerPolicy, 'mock');
    expect(rep.werGap).toBeGreaterThan(0);
    expect(rep.gatePassed).toBe(true);       // WER tracked-only, not gated
    expect(rep.alerts.length).toBeGreaterThan(0);
  });

  it('hard-fails a WER stratum when a threshold is set', () => {
    const gated: SttThresholds = { maxWerPerAccent: 0.2, maxWerGap: null, maxFalseIncorrectPerAccent: 1 };
    const rows: Transcribed[] = [
      { audioPath: 'x', accent: 'Korean', reference: 'a b c d e', hypothesis: 'a b c q z' }, // 40% WER
    ];
    const rep = scoreStt(rows, bank, gated, 'mock');
    expect(rep.gatePassed).toBe(false);
    expect(rep.failures.some((f) => f.includes('Korean'))).toBe(true);
  });

  it('hard-fails when the cross-accent WER gap exceeds the threshold', () => {
    const gapGated: SttThresholds = { maxWerPerAccent: null, maxWerGap: 0.3, maxFalseIncorrectPerAccent: 1 };
    const rows: Transcribed[] = [
      { audioPath: 'g1', accent: 'Spanish', reference: 'a b c d', hypothesis: 'a b c d' }, // 0%
      { audioPath: 'g2', accent: 'Hindi', reference: 'a b c d', hypothesis: 'x y c d' },   // 50%
    ];
    const rep = scoreStt(rows, bank, gapGated, 'mock');
    expect(rep.gatePassed).toBe(false);
    expect(rep.failures.some((f) => f.includes('gap'))).toBe(true);
  });
});
