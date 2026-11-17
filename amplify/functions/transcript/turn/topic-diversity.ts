// amplify/functions/transcript/turn/topic-diversity.ts
// Test-like topic variety for Standard Interviews and Practice.
//
// The 20/80 mastery mix decides WHICH KIND of question to ask; this module
// decides which topic is acceptable, so a learner never drills one category by
// accident. Constraints are applied after bucket selection and relax in a
// fixed, logged order when the available pool cannot satisfy them (for example
// a one-category focus area).
//
// Targets (approved): 2020 Standard uses at least 7 of the 9 USCIS categories,
// no category more than 3 times, and never more than 2 in a row. 2008 Standard
// uses at least 5 categories with the same caps. Practice applies the same mix
// to every rolling, test-sized block of answers. Study is sequential by design
// and does not use this module.

import type { CivicsItem, TestVersion } from './types';

/** Bank slugs that differ from the app's focus ids (see focus.ts). */
const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  'the-1800s': '1800s',
  'recent-american-history': 'recent-history',
};

export interface TopicDiversityTargets {
  /** Distinct USCIS categories required within one exam (or practice block). */
  minCategories: number;
  /** Maximum questions from one category within the scope. */
  maxPerCategory: number;
  /** Maximum consecutive questions from one category. */
  maxConsecutive: number;
}

export const TOPIC_DIVERSITY_TARGETS: Record<TestVersion, TopicDiversityTargets> = {
  '2020': { minCategories: 7, maxPerCategory: 3, maxConsecutive: 2 },
  '2008': { minCategories: 5, maxPerCategory: 3, maxConsecutive: 2 },
};

/** One test-sized practice block; 2020 has 9 categories, 2008 has 9 as well. */
export const PRACTICE_DIVERSITY_WINDOW: Record<TestVersion, number> = {
  '2020': 9,
  '2008': 10,
};

/** A topic cluster stays quiet for the next N questions. */
export const CLUSTER_QUIET_WINDOW = 3;

export type DiversityRelaxation =
  | 'cluster-quiet'
  | 'max-consecutive'
  | 'category-cap'
  | 'category-coverage';

export interface ActiveConstraints {
  clusterQuiet: boolean;
  maxConsecutive: boolean;
  categoryCap: boolean;
  categoryCoverage: boolean;
}

export const RELAXATION_LADDER: Array<{ active: ActiveConstraints; relaxed: DiversityRelaxation[] }> = [
  {
    active: { clusterQuiet: true, maxConsecutive: true, categoryCap: true, categoryCoverage: true },
    relaxed: [],
  },
  {
    active: { clusterQuiet: false, maxConsecutive: true, categoryCap: true, categoryCoverage: true },
    relaxed: ['cluster-quiet'],
  },
  {
    active: { clusterQuiet: false, maxConsecutive: false, categoryCap: true, categoryCoverage: true },
    relaxed: ['cluster-quiet', 'max-consecutive'],
  },
  {
    active: { clusterQuiet: false, maxConsecutive: false, categoryCap: false, categoryCoverage: true },
    relaxed: ['cluster-quiet', 'max-consecutive', 'category-cap'],
  },
  {
    active: { clusterQuiet: false, maxConsecutive: false, categoryCap: false, categoryCoverage: false },
    relaxed: ['cluster-quiet', 'max-consecutive', 'category-cap', 'category-coverage'],
  },
];

/** All diversity constraints active — used when no relaxation is acceptable (Practice). */
export const STRICT_DIVERSITY: ActiveConstraints = {
  clusterQuiet: true,
  maxConsecutive: true,
  categoryCap: true,
  categoryCoverage: true,
};

/** Official USCIS category of an item, normalised to the app's focus ids. */
export function topicCategory(item: CivicsItem): string {
  const raw = item.studyCategoryId?.trim().toLowerCase();
  if (!raw) return 'unknown';
  return CATEGORY_ALIASES[raw] ?? raw;
}

/** Fine-grained cluster; falls back to the category when metadata is absent. */
export function topicCluster(item: CivicsItem): string {
  return item.topicCluster ?? topicCategory(item);
}

export interface DiversityScope {
  version: TestVersion;
  /**
   * Questions already asked inside this scope, oldest to newest. Standard uses
   * the whole interview; Practice passes the current rolling block.
   */
  history: readonly CivicsItem[];
  /**
   * How many questions this scope contains in total (exam length, or the
   * practice window length). Coverage is judged against this size.
   */
  scopeSize: number;
  /**
   * When set, only this constraint level is applied (used by the Standard
   * selector to try strict constraints across all buckets before relaxing).
   * When omitted, the full relaxation ladder runs internally.
   */
  activeConstraints?: ActiveConstraints;
}

export interface DiversityChoice {
  item: CivicsItem;
  relaxations: DiversityRelaxation[];
}

function distinctCategoryCount(items: readonly CivicsItem[]): number {
  return new Set(items.map(topicCategory)).size;
}

function categoryCount(items: readonly CivicsItem[], category: string): number {
  return items.filter((item) => topicCategory(item) === category).length;
}

function violates(
  candidate: CivicsItem,
  scope: DiversityScope,
  active: ActiveConstraints,
): DiversityRelaxation | null {
  const history = scope.history;
  const targets = TOPIC_DIVERSITY_TARGETS[scope.version];
  const category = topicCategory(candidate);
  const cluster = topicCluster(candidate);

  if (active.clusterQuiet) {
    const quietWindow = history.slice(-CLUSTER_QUIET_WINDOW);
    if (quietWindow.some((item) => topicCluster(item) === cluster)) return 'cluster-quiet';
  }

  if (active.maxConsecutive) {
    const tail = history.slice(-targets.maxConsecutive);
    if (tail.length === targets.maxConsecutive
      && tail.every((item) => topicCategory(item) === category)) {
      return 'max-consecutive';
    }
  }

  if (active.categoryCap && categoryCount(history, category) >= targets.maxPerCategory) {
    return 'category-cap';
  }

  if (active.categoryCoverage) {
    const remainingAfterPick = Math.max(0, scope.scopeSize - history.length - 1);
    const seen = history.some((item) => topicCategory(item) === category);
    // Picking a seen category is fine only if we can still reach the category
    // target with the slots that remain. When coverage is already at risk, all
    // seen categories are blocked so the pick must introduce a new category.
    if (seen && distinctCategoryCount(history) + remainingAfterPick < targets.minCategories) {
      return 'category-coverage';
    }
  }

  return null;
}

/**
 * Picks the first candidate, in the caller's priority order, that satisfies every
 * diversity constraint. When `scope.activeConstraints` is set, only that level
 * is applied (used by the Standard selector to try strict constraints across
 * all buckets before relaxing). Otherwise the full relaxation ladder runs.
 */
export function chooseDiverseCandidate(
  candidates: readonly CivicsItem[],
  scope: DiversityScope,
): DiversityChoice | null {
  if (candidates.length === 0) return null;

  const levels = scope.activeConstraints
    ? [{ active: scope.activeConstraints, relaxed: [] as DiversityRelaxation[] }]
    : RELAXATION_LADDER;

  for (const level of levels) {
    for (const candidate of candidates) {
      if (!violates(candidate, scope, level.active)) {
        return { item: candidate, relaxations: level.relaxed };
      }
    }
  }

  // When a single constraint level was imposed (cross-bucket pre-check),
  // no candidate satisfied it — return null so the caller tries the next bucket.
  // With the full ladder, the last level activates no constraints, so this is
  // only reachable for the single-level case.
  return scope.activeConstraints ? null : { item: candidates[0], relaxations: [] };
}
