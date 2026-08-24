// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { allItems, getItem, selectNextQuestion } from '../bank';

describe('civics bank — coverage & integrity', () => {
  const items = allItems();

  it('contains exactly 128 items', () => {
    expect(items.length).toBe(128);
  });

  it('has unique ids', () => {
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(128);
  });

  it('every static item has at least one acceptable answer', () => {
    const bad = items.filter((i) => i.kind === 'static' && i.acceptableAnswers.length === 0);
    expect(bad).toEqual([]);
  });

  it('every dynamic item has NO stored answers (must resolve at runtime, never a stale pass)', () => {
    const bad = items.filter((i) => i.kind === 'dynamic' && i.acceptableAnswers.length > 0);
    expect(bad).toEqual([]);
  });

  it('every item has a non-empty question', () => {
    expect(items.every((i) => typeof i.question === 'string' && i.question.trim().length > 0)).toBe(true);
  });
});

describe('bank lookup & selection', () => {
  it('getItem returns the item for a known id', () => {
    expect(getItem('q-021')?.id).toBe('q-021');
  });

  it('getItem returns null for unknown / missing ids', () => {
    expect(getItem('does-not-exist')).toBeNull();
    expect(getItem(undefined)).toBeNull();
    expect(getItem(null)).toBeNull();
  });

  it('selectNextQuestion avoids a recently-asked id', () => {
    for (let n = 0; n < 20; n++) {
      expect(selectNextQuestion(['q-021']).id).not.toBe('q-021');
    }
  });

  it('selectNextQuestion still returns a valid item when everything is excluded', () => {
    const allIds = allItems().map((i) => i.id);
    const picked = selectNextQuestion(allIds);
    expect(getItem(picked.id)).not.toBeNull();
  });
});
