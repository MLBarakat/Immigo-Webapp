// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allItems } from '../bank';
import {
  MAX_EXAM_QUESTIONS,
  selectNextMockExamItem,
  selectNextMockExamSelection,
  selectQuestionBucket,
  summarizePreviousExam,
  type MockExamMasterySnapshot,
  type MockExamSelectionInput,
  type MockExamSelectionInputWithSeed,
} from '../mock-exam-selector';
import { topicCategory, topicCluster } from '../topic-diversity';

const ITEMS = allItems('2020');
const FIRST = ITEMS[0];

function mastery(
  itemId: string,
  attempts: number,
  correctCount: number,
  lastSeenAt: number,
): MockExamMasterySnapshot {
  return {
    itemId,
    attempts,
    correctCount,
    lastSeenAt,
    mastered: attempts >= 3 && correctCount / attempts > 0.85,
  };
}

function selection(overrides: Partial<MockExamSelectionInputWithSeed> = {}): MockExamSelectionInputWithSeed {
  return {
    version: '2020',
    askedItemIds: [],
    mastery: [],
    previousMissItemIds: [],
    ...overrides,
  };
}

function askSequence(count: number, input: MockExamSelectionInput): string[] {
  const asked = [...input.askedItemIds];
  for (let index = asked.length; index < count; index += 1) {
    const next = selectNextMockExamItem({ ...input, askedItemIds: asked });
    if (!next) break;
    asked.push(next.id);
  }
  return asked;
}

describe('Standard Interview dynamic selector', () => {
  it('starts with the lowest-numbered unseen question', () => {
    expect(selectNextMockExamItem(selection())?.id).toBe(FIRST.id);
  });

  it('never repeats a question already asked this interview', () => {
    const asked = askSequence(10, selection());
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('keeps the 20/80 quota over the questions actually asked', () => {
    const weak = ITEMS.slice(0, 4).map((item, index) => mastery(item.id, 3, 1, 100 + index));
    const review = ITEMS.slice(4, 6).map((item, index) => mastery(item.id, 4, 4, 100 + index));
    const asked = askSequence(10, selection({ mastery: [...weak, ...review] }));

    const snapshots = new Map([...weak, ...review].map(snapshot => [snapshot.itemId, snapshot]));
    const counts = { new: 0, weak: 0, review: 0 };
    for (const id of asked) {
      const snapshot = snapshots.get(id);
      if (!snapshot) counts.new += 1;
      else counts[snapshot.mastered ? 'review' : 'weak'] += 1;
    }

    expect(counts).toEqual({ new: 4, weak: 4, review: 2 });
  });

  it('reviews mastered questions least-recently-seen first', () => {
    const older = mastery(ITEMS[4].id, 4, 4, 100);
    const newer = mastery(ITEMS[5].id, 4, 4, 500);
    const asked = askSequence(8, selection({ mastery: [older, newer] }));
    const reviewOrder = asked.filter(id => id === older.itemId || id === newer.itemId);

    expect(reviewOrder).toEqual([older.itemId, newer.itemId]);
  });

  it('prioritises previous-exam misses inside the weak pool, then lower mastery', () => {
    const missed = mastery(ITEMS[1].id, 4, 1, 300);
    const lowerMastery = mastery(ITEMS[0].id, 4, 0, 100);
    const asked = askSequence(4, selection({
      mastery: [missed, lowerMastery],
      previousMissItemIds: [missed.itemId],
    }));

    expect(asked[1]).toBe(missed.itemId);
    expect(asked[3]).toBe(lowerMastery.itemId);
  });

  it('falls back to another pool when the preferred pool is exhausted', () => {
    const reviewed = ITEMS.slice(0, 2).map((item, index) => mastery(item.id, 4, 4, index));
    const asked = askSequence(3, selection({
      mastery: reviewed,
      previousMissItemIds: [],
    }));

    expect(asked).toHaveLength(3);
    expect(new Set(asked).size).toBe(3);
  });

  it('stops at the version maximum', () => {
    const asked = askSequence(20, selection());
    expect(asked).toHaveLength(MAX_EXAM_QUESTIONS['2020']);
    expect(selectNextMockExamItem(selection({ askedItemIds: asked }))).toBeNull();
  });

  it('tie-breaks the running quota in new, weak, review order', () => {
    const first = mastery(ITEMS[0].id, 3, 1, 100);
    expect(selectQuestionBucket(selection({ mastery: [first] }), new Map([[first.itemId, first]]))).toBe('new');
  });

  it('summarises the last completed interview and flags an early end', () => {
    expect(summarizePreviousExam('2020', {
      correct_count: 12,
      incorrect_count: 4,
      question_ids: ITEMS.slice(0, 16).map(item => item.id),
    })).toEqual({
      correct: 12,
      incorrect: 4,
      total: 16,
      passed: true,
      endedEarly: true,
      questionIds: ITEMS.slice(0, 16).map(item => item.id),
    });
  });
});

function askSequenceDiverse(
  count: number,
  input: MockExamSelectionInputWithSeed,
): string[] {
  const asked = [...input.askedItemIds];
  for (let index = asked.length; index < count; index += 1) {
    const result = selectNextMockExamSelection({ ...input, askedItemIds: asked });
    if (!result) break;
    asked.push(result.item.id);
  }
  return asked;
}

describe('Standard Interview topic diversity', () => {
  it('keeps a full 2020 interview at seven categories, three per category, and two in a row', () => {
    const asked = askSequenceDiverse(20, selection());
    const items = asked.map(id => ITEMS.find(item => item.id === id)!);
    const categories = items.map(topicCategory);

    expect(new Set(categories).size).toBeGreaterThanOrEqual(7);
    const counts = new Map<string, number>();
    for (const category of categories) counts.set(category, (counts.get(category) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    expect(categories.some((category, index) =>
      index >= 2 && categories[index - 1] === category && categories[index - 2] === category)).toBe(false);

    const clusters = items.map(topicCluster);
    for (let index = 3; index < clusters.length; index += 1) {
      expect(clusters.slice(index - 3, index)).not.toContain(clusters[index]);
    }
  });

  it('keeps a full 2008 interview at five categories', () => {
    const asked = askSequenceDiverse(10, selection({ version: '2008' }));
    const categories = asked.map(id => topicCategory(allItems('2008').find(item => item.id === id)!));
    expect(new Set(categories).size).toBeGreaterThanOrEqual(5);
  });

  it('is reproducible from the exam id and varies across exams', () => {
    const a = askSequenceDiverse(20, selection({ seed: 'exam-a' }));
    const again = askSequenceDiverse(20, selection({ seed: 'exam-a' }));
    const b = askSequenceDiverse(20, selection({ seed: 'exam-b' }));

    expect(again).toEqual(a);
    expect(b).not.toEqual(a);
  });

  it('reports a cross-bucket pick instead of violating a diversity rule', () => {
    const congress = ITEMS.filter(item => topicCluster(item) === 'congress');
    const [first, second, newA, newB] = congress;
    const history = [first.id, second.id];
    const mastery = ITEMS
      .filter(item => item.id !== newA.id && item.id !== newB.id)
      .map(item => item.id === first.id || item.id === second.id
        ? masterySnapshot(item.id, 4, 4, 100)
        : masterySnapshot(item.id, 3, 1, 200));

    const result = selectNextMockExamSelection(selection({ askedItemIds: history, mastery }));

    expect(result).not.toBeNull();
    expect(result!.preferredBucket).toBe('new');
    expect(result!.crossBucket).toBe(true);
    expect(result!.bucket).not.toBe('new');
    expect(result!.relaxations).toEqual([]);
    expect(topicCluster(result!.item)).not.toBe(topicCluster(first));
  });
});

function masterySnapshot(
  itemId: string,
  attempts: number,
  correctCount: number,
  lastSeenAt: number,
): MockExamMasterySnapshot {
  return {
    itemId,
    attempts,
    correctCount,
    lastSeenAt,
    mastered: attempts >= 3 && correctCount / attempts > 0.85,
  };
}
