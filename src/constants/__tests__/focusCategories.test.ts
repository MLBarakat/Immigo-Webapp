import { describe, expect, it } from 'vitest';
import bank2008 from '../../../amplify/functions/transcript/civics-bank.2008-100.json';
import bank2020 from '../../../amplify/functions/transcript/civics-bank.2020-128.json';
import {
  FOCUS_CATEGORY_IDS,
  getFocusCategories,
  parseLearningGoal,
  serializeLearningGoal,
} from '../focusCategories';

type Bank = {
  studyKnowledge: {
    categories: Array<{ id: string; title: string }>;
  };
};

const banks = {
  '2008': (bank2008 as Bank).studyKnowledge.categories,
  '2020': (bank2020 as Bank).studyKnowledge.categories,
} as const;

describe('focus categories', () => {
  it('uses every official USCIS study category and no invented ones', () => {
    for (const version of ['2008', '2020'] as const) {
      const categories = getFocusCategories(version);
      expect(categories.map(category => category.id)).toEqual(FOCUS_CATEGORY_IDS);
      expect(categories.map(category => category.label)).toEqual(
        banks[version].map(category => category.title),
      );
    }
  });

  it('round-trips up to three saved categories and free-text Other', () => {
    const categories = getFocusCategories('2020');
    const selected = [categories[0].id, categories[4].id, categories[8].id];
    const saved = serializeLearningGoal(selected, 'Local government', '2020');
    expect(saved).toBe(
      `${categories[0].label}; ${categories[4].label}; ${categories[8].label}; Local government`,
    );

    const parsed = parseLearningGoal(saved, '2020');
    expect(parsed.selectedIds).toEqual(selected);
    expect(parsed.other).toBe('Local government');
  });

  it('recognises a category saved under the other bank edition', () => {
    const saved = serializeLearningGoal(['1800s'], '', '2008');
    expect(saved).toBe('The 1800s');

    const parsed = parseLearningGoal(saved, '2020');
    expect(parsed.selectedIds).toEqual(['1800s']);
    expect(parsed.other).toBe('');
  });

  it('treats unmatched text as Other and ignores empty entries', () => {
    const parsed = parseLearningGoal('  ; Learn about my city ; ', '2020');
    expect(parsed.selectedIds).toEqual([]);
    expect(parsed.other).toBe('Learn about my city');
  });
});
