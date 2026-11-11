// amplify/functions/transcript/turn/focus.ts
// Practice/Study focus areas.
//
// The database stores a learning goal as human-readable text (category labels
// joined with "; ", or the exact "All focus areas" sentinel). The selector
// needs stable, version-independent category IDs, so this module owns the
// translation both ways. The 2008 bank uses two longer slugs than the app's
// focus selector; those are normalised here as well.

import { allItems, getStudyCategories } from './bank';
import type { CivicsItem, TestVersion } from './types';

export const ALL_FOCUS_AREAS = 'All focus areas';

/** Browser-facing focus IDs, in official bank order. */
export const FOCUS_CATEGORY_IDS = [
  'principles-of-american-democracy',
  'system-of-government',
  'rights-and-responsibilities',
  'colonial-period-and-independence',
  '1800s',
  'recent-history',
  'geography',
  'symbols',
  'holidays',
] as const;

const CATEGORY_ID_ALIASES: Record<string, string> = {
  'the-1800s': '1800s',
  'recent-american-history': 'recent-history',
};

export interface ParsedFocusGoal {
  all: boolean;
  categoryIds: string[];
  labels: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Maps a stored ID, a bank slug, or a category title to a focus category ID. */
export function normalizeFocusCategoryId(value: string | null | undefined): string | null {
  if (!value) return null;
  const token = normalize(value);
  const alias = CATEGORY_ID_ALIASES[token];
  if (alias) return alias;
  if ((FOCUS_CATEGORY_IDS as readonly string[]).includes(token)) return token;
  for (const version of ['2008', '2020'] as const) {
    const category = getStudyCategories(version).find(
      entry => normalize(entry.id) === token || normalize(entry.title) === token,
    );
    if (category) return CATEGORY_ID_ALIASES[normalize(category.id)] ?? category.id;
  }
  return null;
}

export function isAllFocusAreas(value: string | null | undefined): boolean {
  return normalize(value ?? '') === normalize(ALL_FOCUS_AREAS);
}

/** Reads a saved goal into selector IDs. Unknown free text means "no filter". */
export function parseFocusGoal(
  value: string | null | undefined,
  version: TestVersion,
): ParsedFocusGoal {
  const trimmed = (value ?? '').trim();
  if (!trimmed || isAllFocusAreas(trimmed)) {
    return { all: true, categoryIds: [], labels: [] };
  }
  const categoryIds: string[] = [];
  for (const chunk of trimmed.split(';').map(part => part.trim()).filter(Boolean)) {
    const id = normalizeFocusCategoryId(chunk);
    if (id && !categoryIds.includes(id)) categoryIds.push(id);
  }
  if (categoryIds.length === 0) {
    // A hand-written "Other" goal has no category to filter on; selection
    // falls back to the whole bank rather than silently asking nothing.
    return { all: true, categoryIds: [], labels: [] };
  }
  const limited = categoryIds.slice(0, 3);
  return {
    all: false,
    categoryIds: limited,
    labels: limited.map(id => focusCategoryLabel(id, version) ?? id),
  };
}

/** Saves selected categories using the active bank edition's labels. */
export function serializeFocusGoal(
  categoryIds: string[],
  all: boolean,
  version: TestVersion,
): string {
  if (all) return ALL_FOCUS_AREAS;
  const labels = categoryIds
    .map(id => focusCategoryLabel(id, version))
    .filter((label): label is string => Boolean(label));
  return labels.length > 0 ? labels.join('; ') : ALL_FOCUS_AREAS;
}

export function focusCategoryLabel(id: string, version: TestVersion): string | null {
  const target = normalizeFocusCategoryId(id);
  if (!target) return null;
  const category = getStudyCategories(version).find(
    entry => (CATEGORY_ID_ALIASES[normalize(entry.id)] ?? entry.id) === target,
  );
  return category?.title ?? null;
}

export function filterItemsByFocus(
  items: CivicsItem[],
  categoryIds: string[],
): CivicsItem[] {
  if (categoryIds.length === 0) return items;
  const wanted = new Set(categoryIds);
  return items.filter((item) => {
    const id = normalizeFocusCategoryId(item.studyCategoryId);
    return id !== null && wanted.has(id);
  });
}

/** The focus pool, or the whole bank when the filter matches nothing. */
export function focusedItems(version: TestVersion, categoryIds: string[]): CivicsItem[] {
  const pool = filterItemsByFocus(allItems(version), categoryIds);
  return pool.length > 0 ? pool : allItems(version);
}

export interface FocusCycleState {
  /** Items already asked in the current pass. */
  remaining: Set<string>;
  /** The previous turn completed a full pass, so this pick starts a new one. */
  cycleRestarted: boolean;
}

/**
 * Reconstructs the current pass from the session's ordered graded items.
 * A pass ends the moment every pool item has been seen once; the simulation
 * then clears the set, which is why the tail after the last full pass is the
 * only reliable "asked this time around" list without adding DB state.
 */
export function focusCycleState(
  poolIds: string[],
  orderedAskedIds: string[],
): FocusCycleState {
  if (poolIds.length === 0) return { remaining: new Set(), cycleRestarted: false };
  const pool = new Set(poolIds);
  let asked = new Set<string>();
  let restarted = false;
  for (const id of orderedAskedIds) {
    if (!pool.has(id)) continue;
    if (asked.size === 0 && restarted) restarted = false;
    asked.add(id);
    if (asked.size === pool.size) {
      asked = new Set();
      restarted = true;
    }
  }
  return { remaining: asked, cycleRestarted: restarted };
}

export interface FocusedQuestionSelection {
  item: CivicsItem;
  cycleRestarted: boolean;
}

/**
 * Practice picks a random item from the current focus pass. A full pass is
 * required before any item can repeat, and the caller gets the notice flag on
 * the pick that starts the next pass.
 */
export function selectFocusedPracticeQuestion(
  version: TestVersion,
  categoryIds: string[],
  orderedAskedIds: string[],
  currentItemId: string | null = null,
): FocusedQuestionSelection {
  const pool = focusedItems(version, categoryIds);
  const state = focusCycleState(pool.map(item => item.id), orderedAskedIds);
  let candidates = pool.filter(item => !state.remaining.has(item.id) && item.id !== currentItemId);
  if (candidates.length === 0) {
    candidates = pool.filter(item => !state.remaining.has(item.id));
  }
  if (candidates.length === 0) {
    // Only possible for a one-question focus: a "pass" cannot avoid repeating
    // the same item, so surface the cycle notice instead of getting stuck.
    const fallback = pool.filter(item => item.id !== currentItemId);
    const items = fallback.length > 0 ? fallback : pool;
    return {
      item: items[Math.floor(Math.random() * items.length)],
      cycleRestarted: true,
    };
  }
  return {
    item: candidates[Math.floor(Math.random() * candidates.length)],
    cycleRestarted: state.cycleRestarted,
  };
}

/**
 * Study walks the focus pool in bank order. The learner's ordered mode-scoped
 * history is the pass state, so closing the app does not restart coverage:
 * the next pick continues at the first question they have not studied yet.
 * The notice appears on the first pick after every pool item has been seen.
 */
export function selectFocusedStudyQuestion(
  version: TestVersion,
  categoryIds: string[],
  orderedAskedIds: string[] = [],
  currentItemId: string | null = null,
): FocusedQuestionSelection {
  const pool = focusedItems(version, categoryIds)
    .slice()
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  if (pool.length === 0) {
    const fallback = allItems(version);
    return { item: fallback[0], cycleRestarted: false };
  }
  const state = focusCycleState(pool.map(item => item.id), orderedAskedIds);
  const next = pool.find(item => !state.remaining.has(item.id) && item.id !== currentItemId)
    ?? pool.find(item => !state.remaining.has(item.id))
    ?? pool[0];
  return {
    item: next,
    cycleRestarted: state.cycleRestarted && state.remaining.size === 0,
  };
}
