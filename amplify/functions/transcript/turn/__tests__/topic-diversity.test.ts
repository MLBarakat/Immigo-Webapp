// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allItems, getItem } from '../bank';
import {
  CLUSTER_QUIET_WINDOW,
  PRACTICE_DIVERSITY_WINDOW,
  TOPIC_DIVERSITY_TARGETS,
  chooseDiverseCandidate,
  topicCategory,
  topicCluster,
} from '../topic-diversity';

const items2020 = allItems('2020');
const items2008 = allItems('2008');

function pickWhere(ids: string[], version: '2008' | '2020' = '2020') {
  return ids.map((id) => getItem(id, version)!);
}

describe('topicCluster metadata', () => {
  it('labels every bank item with a topic cluster', () => {
    for (const item of [...items2020, ...items2008]) {
      expect(item.topicCluster, item.id).toBeTruthy();
      expect(item.topicCluster).not.toBe(item.studyCategoryId);
    }
  });

  it('uses several clusters inside a single official category', () => {
    const systemClusters = new Set(
      items2020.filter((item) => topicCategory(item) === 'system-of-government').map(topicCluster),
    );
    expect(systemClusters.size).toBeGreaterThanOrEqual(5);
  });
});

describe('diversity targets', () => {
  it('encodes the approved 2020 and 2008 targets', () => {
    expect(TOPIC_DIVERSITY_TARGETS['2020']).toEqual({
      minCategories: 7,
      maxPerCategory: 3,
      maxConsecutive: 2,
    });
    expect(TOPIC_DIVERSITY_TARGETS['2008']).toEqual({
      minCategories: 5,
      maxPerCategory: 3,
      maxConsecutive: 2,
    });
    expect(PRACTICE_DIVERSITY_WINDOW['2020']).toBe(9);
    expect(PRACTICE_DIVERSITY_WINDOW['2008']).toBe(10);
    expect(CLUSTER_QUIET_WINDOW).toBe(3);
  });
});

describe('chooseDiverseCandidate', () => {
  it('suppresses a cluster that appeared in the last three questions', () => {
    const [congressA, congressB, other] = [
      items2020.find((item) => topicCluster(item) === 'congress')!,
      items2020.find((item) =>
        topicCluster(item) === 'congress' && item.id !== items2020.find((entry) => topicCluster(entry) === 'congress')!.id)!,
      items2020.find((item) => topicCluster(item) === 'supreme-court')!,
    ];
    const history = [congressA];

    const choice = chooseDiverseCandidate([congressB, other], {
      version: '2020',
      history,
      scopeSize: 20,
    });

    expect(choice?.item.id).toBe(other.id);
    expect(choice?.relaxations).toEqual([]);
  });

  it('rejects a third consecutive item from one category while an alternative exists', () => {
    const system = items2020.filter((item) => topicCategory(item) === 'system-of-government');
    const alternative = items2020.find((item) => topicCategory(item) === 'geography')!;
    const history = system.slice(0, 2);

    const choice = chooseDiverseCandidate([system[5], alternative], {
      version: '2020',
      history,
      scopeSize: 20,
    });

    expect(choice?.item.id).toBe(alternative.id);
    expect(choice?.relaxations).toEqual([]);
  });

  it('caps a category at three questions inside the exam scope', () => {
    const system = items2020.filter((item) => topicCategory(item) === 'system-of-government');
    const otherCategories = items2020.filter((item) =>
      topicCategory(item) !== 'system-of-government' && topicCategory(item) !== 'geography');
    // Three system questions already asked; other categories keep the coverage
    // requirement reachable.
    const history = [...system.slice(0, 3), ...otherCategories.slice(0, 5)];
    const alternative = items2020.find((item) => topicCategory(item) === 'geography')!;

    const choice = chooseDiverseCandidate([system[7], alternative], {
      version: '2020',
      history,
      scopeSize: 20,
    });

    expect(choice?.item.id).toBe(alternative.id);
    expect(choice?.relaxations).toEqual([]);
  });

  it('forces a new category while the exam can still reach the target', () => {
    // 2008: four categories after nine questions; one slot remains. Picking a
    // seen category makes five impossible, so the pick must be new.
    const history = pickWhere([
      '2008-001', '2008-002', '2008-003',
      '2008-013', '2008-014',
      '2008-048', '2008-049',
      '2008-058', '2008-059',
    ], '2008');
    const seenCategory = getItem('2008-015', '2008')!;
    const unseenCategory = getItem('2008-071', '2008')!;

    expect(new Set(history.map(topicCategory)).size).toBe(4);

    const choice = chooseDiverseCandidate([seenCategory, unseenCategory], {
      version: '2008',
      history,
      scopeSize: 10,
    });

    expect(choice?.item.id).toBe(unseenCategory.id);
    expect(choice?.relaxations).toEqual([]);
  });

  it('applies the practice window instead of the whole lifetime history', () => {
    // Eight items across only SIX distinct categories; one slot remains in a
    // nine-question block, so picking a seen category again makes seven
    // unreachable — the pick must introduce a new category.
    const history = pickWhere([
      'q-001', 'q-002', 'q-021', 'q-065', 'q-078', 'q-100', 'q-103', 'q-118',
    ]);
    const unseenCategory = getItem('q-125', '2020')!; // holidays
    const repeatedCategory = getItem('q-002', '2020')!; // principles (already seen)

    expect(new Set(history.map(topicCategory)).size).toBe(6);

    const choice = chooseDiverseCandidate([repeatedCategory, unseenCategory], {
      version: '2020',
      history,
      scopeSize: PRACTICE_DIVERSITY_WINDOW['2020'],
    });

    expect(choice?.item.id).toBe(unseenCategory.id);
    expect(choice?.relaxations).toEqual([]);
  });

  it('relaxes a constraint only when no candidate can satisfy it', () => {
    const system = items2020.filter((item) => topicCategory(item) === 'system-of-government');
    // Three system-of-government questions already asked hits the per-category
    // cap, and the last two were consecutive system picks, so every remaining
    // system candidate violates both cap and consecutive. The pool has no
    // alternative category, so those constraints are relaxed and reported.
    const choice = chooseDiverseCandidate(system.slice(0, 2), {
      version: '2020',
      history: system.slice(2, 5),
      scopeSize: 20,
    });

    expect(choice).not.toBeNull();
    expect(choice!.relaxations).toEqual(['cluster-quiet', 'max-consecutive', 'category-cap']);
  });

  it('returns null only when there are no candidates', () => {
    expect(chooseDiverseCandidate([], { version: '2020', history: [], scopeSize: 20 })).toBeNull();
  });
});
