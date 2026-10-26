// amplify/functions/transcript/turn/bank.ts
// Loads the official bank (bundled JSON) and provides lookup + selection.

import bankJson from '../civics-bank.2020-128.json';
import bank2008Json from '../civics-bank.2008-100.json';
import type { CivicsItem } from './types';

type CivicsBank = {
  edition: string;
  items: CivicsItem[];
  studyKnowledge: {
    categories: Array<{ id: string; title: string; firstQuestion: number; lastQuestion: number }>;
  };
};
const banks: Record<'2008' | '2020', CivicsBank> = {
  '2008': bank2008Json as CivicsBank,
  '2020': bankJson as CivicsBank,
};

function getBank(version: '2008' | '2020' = '2020'): CivicsBank {
  return banks[version];
}

export function getStudyCategoryTitle(item: CivicsItem): string {
  const version = item.edition === '2008-100' ? '2008' : '2020';
  const category = item.studyCategoryId
    ? getBank(version).studyKnowledge.categories.find((entry) => entry.id === item.studyCategoryId)
    : undefined;
  if (!category) {
    throw new Error(`Civics item ${item.id} has no valid USCIS study category.`);
  }
  return category.title;
}

export function getItem(id: string | null | undefined, version: '2008' | '2020' = '2020'): CivicsItem | null {
  if (!id) return null;
  const inferredVersion = id.startsWith('2008-') ? '2008' : version;
  const items = getBank(inferredVersion).items;
  const match = items.find((item) => item.id === id);
  if (match) return match;
  const numberMatch = /(?:q-|2008-)(\d{1,3})$/.exec(id);
  const questionNumber = numberMatch ? Number(numberMatch[1]) : NaN;
  return Number.isFinite(questionNumber) ? items.find((item) => item.number === questionNumber) ?? null : null;
}

export function allItems(version: '2008' | '2020' = '2020'): CivicsItem[] {
  return getBank(version).items;
}

export function getFirstQuestion(version: '2008' | '2020' = '2020'): CivicsItem {
  return allItems(version).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))[0];
}

/** Pick the next question the SERVER will ask. Simple random-avoiding-recent. */
export function selectNextQuestion(recentIds: string[] = [], version: '2008' | '2020' = '2020'): CivicsItem {
  const recent = new Set(recentIds);
  const items = allItems(version);
  const pool = items.filter((i) => !recent.has(i.id));
  const from = pool.length > 0 ? pool : items;
  return from[Math.floor(Math.random() * from.length)];
}

export function getNextSequentialQuestion(item: CivicsItem, version: '2008' | '2020' = '2020'): CivicsItem {
  const items = allItems(version).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const index = items.findIndex((candidate) => candidate.id === item.id);
  return items[(index + 1 + items.length) % items.length];
}
