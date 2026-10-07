// amplify/functions/transcript/turn/bank.ts
// Loads the official bank (bundled JSON) and provides lookup + selection.

import bankJson from '../civics-bank.2020-128.json';
import type { CivicsItem } from './types';

const bank = bankJson as {
  items: CivicsItem[];
  studyKnowledge: {
    categories: Array<{ id: string; title: string; firstQuestion: number; lastQuestion: number }>;
  };
};
const items = bank.items;
const studyCategories = new Map(bank.studyKnowledge.categories.map((category) => [category.id, category]));
const byId = new Map(items.map((i) => [i.id, i]));

export function getStudyCategoryTitle(item: CivicsItem): string {
  const category = item.studyCategoryId ? studyCategories.get(item.studyCategoryId) : undefined;
  if (!category) {
    throw new Error(`Civics item ${item.id} has no valid USCIS study category.`);
  }
  return category.title;
}

export function getItem(id: string | null | undefined): CivicsItem | null {
  if (!id) return null;
  return byId.get(id) ?? null;
}

export function allItems(): CivicsItem[] {
  return items;
}

/** Pick the next question the SERVER will ask. Simple random-avoiding-recent. */
export function selectNextQuestion(recentIds: string[] = []): CivicsItem {
  const recent = new Set(recentIds);
  const pool = items.filter((i) => !recent.has(i.id));
  const from = pool.length > 0 ? pool : items;
  return from[Math.floor(Math.random() * from.length)];
}
