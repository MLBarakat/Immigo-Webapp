// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { allItems } from '../bank';
import {
  selectNextMockExamSelection,
  type MockExamSelectionInputWithSeed,
} from '../mock-exam-selector';
import { topicCategory } from '../topic-diversity';

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

describe('Standard Interview randomization regression', () => {
  it('never repeats a question across a full 20-question interview', () => {
    const asked: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const result = selectNextMockExamSelection(selection({ askedItemIds: asked }));
      if (!result) break;
      asked.push(result.item.id);
    }
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('keeps category diversity across a full 20-question interview', () => {
    const asked: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const result = selectNextMockExamSelection(selection({ askedItemIds: asked }));
      if (!result) break;
      asked.push(result.item.id);
    }
    const categories = asked.map(id => topicCategory(ITEMS.find(item => item.id === id)!));
    // No more than 2 consecutive from same category
    expect(categories.some((cat, idx) =>
      idx >= 2 && categories[idx - 1] === cat && categories[idx - 2] === cat)).toBe(false);
    // At least 7 categories
    expect(new Set(categories).size).toBeGreaterThanOrEqual(7);
  });
});
