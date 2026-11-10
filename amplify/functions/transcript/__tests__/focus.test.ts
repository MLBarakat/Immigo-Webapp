// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allItems } from '../turn/bank';
import {
  ALL_FOCUS_AREAS,
  filterItemsByFocus,
  focusCategoryLabel,
  focusCycleState,
  focusedItems,
  normalizeFocusCategoryId,
  parseFocusGoal,
  selectFocusedPracticeQuestion,
  selectFocusedStudyQuestion,
  serializeFocusGoal,
} from '../turn/focus';

describe('Practice/Study focus areas', () => {
  it('normalises the 2008 bank category slugs to the app focus ids', () => {
    expect(normalizeFocusCategoryId('the-1800s')).toBe('1800s');
    expect(normalizeFocusCategoryId('recent-american-history')).toBe('recent-history');
    expect(normalizeFocusCategoryId('The 1800s')).toBe('1800s');
    expect(normalizeFocusCategoryId('not-a-category')).toBeNull();
  });

  it('parses a saved 2008 goal into selector ids and labels', () => {
    const parsed = parseFocusGoal('The 1800s; Recent American History', '2008');

    expect(parsed.all).toBe(false);
    expect(parsed.categoryIds).toEqual(['1800s', 'recent-history']);
    expect(parsed.labels).toEqual(['The 1800s', 'Recent American History']);
  });

  it('treats the exact All sentinel, an empty goal, and unknown free text as All', () => {
    expect(parseFocusGoal(ALL_FOCUS_AREAS, '2020').all).toBe(true);
    expect(parseFocusGoal('', '2020').all).toBe(true);
    expect(parseFocusGoal('Practice with my neighbour', '2020')).toEqual({
      all: true,
      categoryIds: [],
      labels: [],
    });
  });

  it('serialises with the active bank labels and the exact All sentinel', () => {
    expect(serializeFocusGoal(['1800s'], false, '2008')).toBe('The 1800s');
    expect(serializeFocusGoal(['1800s'], false, '2020')).toBe('1800s');
    expect(serializeFocusGoal(['1800s'], true, '2020')).toBe(ALL_FOCUS_AREAS);
    expect(focusCategoryLabel('recent-history', '2008')).toBe('Recent American History');
  });

  it('filters the bank to the selected focus and falls back to the whole bank', () => {
    const filtered = filterItemsByFocus(allItems('2020'), ['geography']);
    expect(filtered.length).toBeGreaterThan(0);
    for (const item of filtered) {
      expect(normalizeFocusCategoryId(item.studyCategoryId)).toBe('geography');
    }
    expect(focusedItems('2020', ['not-a-category'])).toHaveLength(allItems('2020').length);
  });

  it('requires a full pass before repeating a Practice question', () => {
    const pool = focusedItems('2020', ['geography']);
    const asked = pool[0].id;
    const selected = selectFocusedPracticeQuestion('2020', ['geography'], [asked], asked);

    expect(pool.map(item => item.id)).toContain(selected.item.id);
    expect(selected.item.id).not.toBe(asked);
    expect(selected.cycleRestarted).toBe(false);
  });

  it('restarts the focus cycle only after every item in the pool was asked', () => {
    const pool = focusedItems('2020', ['geography']);
    const ordered = pool.map(item => item.id);
    const state = focusCycleState(ordered, ordered);

    expect(state.remaining.size).toBe(0);
    expect(state.cycleRestarted).toBe(true);
    const selected = selectFocusedPracticeQuestion('2020', ['geography'], ordered);
    expect(selected.cycleRestarted).toBe(true);
  });

  it('walks Study in bank order and signals the pass notice on the first repeat', () => {
    const pool = focusedItems('2020', ['geography'])
      .slice()
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

    expect(selectFocusedStudyQuestion('2020', ['geography']).item.id).toBe(pool[0].id);
    const next = selectFocusedStudyQuestion('2020', ['geography'], pool[0].id);
    expect(next.item.id).toBe(pool[1].id);
    expect(next.cycleRestarted).toBe(false);

    const restarted = selectFocusedStudyQuestion(
      '2020',
      ['geography'],
      pool[pool.length - 1].id,
    );
    expect(restarted.item.id).toBe(pool[0].id);
    expect(restarted.cycleRestarted).toBe(true);
  });
});
