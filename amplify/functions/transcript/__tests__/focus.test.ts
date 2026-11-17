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
    const next = selectFocusedStudyQuestion('2020', ['geography'], [pool[0].id]);
    expect(next.item.id).toBe(pool[1].id);
    expect(next.cycleRestarted).toBe(false);

    const restarted = selectFocusedStudyQuestion(
      '2020',
      ['geography'],
      pool.map(item => item.id),
      pool[pool.length - 1].id,
    );
    expect(restarted.item.id).toBe(pool[0].id);
    expect(restarted.cycleRestarted).toBe(true);
  });

  it('covers every Study question across sessions before repeating', () => {
    const pool = focusedItems('2020', ['geography'])
      .slice()
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

    // The first two questions were answered in an earlier session. The next
    // session must continue at the first unanswered bank item, not restart.
    const selected = selectFocusedStudyQuestion('2020', ['geography'], [pool[0].id, pool[1].id]);
    expect(selected.item.id).toBe(pool[2].id);
    expect(selected.cycleRestarted).toBe(false);

    const completePass = selectFocusedStudyQuestion(
      '2020',
      ['geography'],
      pool.map(item => item.id),
      pool[pool.length - 1].id,
    );
    expect(completePass.item.id).toBe(pool[0].id);
    expect(completePass.cycleRestarted).toBe(true);
  });
});

function categoryOf(id: string): string {
  const item = allItems('2020').find(entry => entry.id === id)!;
  return normalizeFocusCategoryId(item.studyCategoryId) ?? '';
}

function clusterOf(id: string): string {
  return allItems('2020').find(entry => entry.id === id)!.topicCluster!;
}

function practiceSequence(seed: string, count: number): string[] {
  const asked: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const selected = selectFocusedPracticeQuestion('2020', [], asked, asked[asked.length - 1] ?? null, { seed });
    asked.push(selected.item.id);
  }
  return asked;
}

describe('Practice topic diversity', () => {
  it('keeps every nine-question practice block at seven categories and three per category', () => {
    const asked = practiceSequence('practice-diversity', 36);

    for (let start = 0; start + 9 <= asked.length; start += 1) {
      const window = asked.slice(start, start + 9);
      const categories = window.map(categoryOf);
      expect(new Set(categories).size).toBeGreaterThanOrEqual(7);
      const counts = new Map<string, number>();
      for (const category of categories) counts.set(category, (counts.get(category) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
      expect(categories.some((category, index) =>
        index >= 2 && categories[index - 1] === category && categories[index - 2] === category)).toBe(false);

      const clusters = window.map(clusterOf);
      for (let index = 3; index < clusters.length; index += 1) {
        expect(clusters.slice(index - 3, index)).not.toContain(clusters[index]);
      }
    }
  });

  it('is reproducible from the session id and varies across sessions', () => {
    expect(practiceSequence('session-a', 10)).toEqual(practiceSequence('session-a', 10));
    expect(practiceSequence('session-a', 10)).not.toEqual(practiceSequence('session-b', 10));
  });

  it('keeps the full-pass rule when a seeded pick is used', () => {
    const pool = focusedItems('2020', []);
    const historic = pool.slice(0, 60).map(item => item.id);
    const selected = selectFocusedPracticeQuestion('2020', [], historic, null, { seed: 'pass' });

    expect(historic.slice(-pool.length)).not.toContain(selected.item.id);
  });
});
