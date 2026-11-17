// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { allItems } from '../bank';
import { selectNextMockExamSelection,
  type MockExamSelectionInputWithSeed,
} from '../mock-exam-selector';

const ITEMS = allItems('2020');

function selection(overrides: Partial<MockExamSelectionInputWithSeed> = {}): MockExamSelectionInputWithSeed {
  return {
    version: '2020',
    askedItemIds: [],
    mastery: [],
    previousMissItemIds: [],
    ...overrides,
  };
}

describe('Standard Interview randomization with mastery history', () => {
  it('does not repeat questions when most items are weak from prior practice', () => {
    // Simulate a user who has practiced most questions before (all weak).
    // Only q-071 and q-072 were just asked in this interview.
    const weakItems = ITEMS.slice(0, 50).map((item, index) => ({
      itemId: item.id,
      attempts: 1,
      correctCount: 0,
      lastSeenAt: 1000 + index,
      mastered: false,
    }));

    const asked: string[] = ['q-072', 'q-071']; // Just asked these two

    for (let i = 0; i < 10; i += 1) {
      const result = selectNextMockExamSelection(selection({
        askedItemIds: asked,
        mastery: weakItems,
      }));
      if (!result) break;
      // Never repeat an already-asked question
      expect(asked).not.toContain(result.item.id);
      asked.push(result.item.id);
    }
  });

  it('never repeats a question across a full interview with mastery', () => {
    const mastery = ITEMS.slice(0, 30).map((item, index) => ({
      itemId: item.id,
      attempts: 2,
      correctCount: 1,
      lastSeenAt: 1000 + index,
      mastered: false,
    }));

    const asked: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const result = selectNextMockExamSelection(selection({
        askedItemIds: asked,
        mastery,
      }));
      if (!result) break;
      expect(asked).not.toContain(result.item.id);
      asked.push(result.item.id);
    }
    expect(new Set(asked).size).toBe(asked.length);
  });
});
