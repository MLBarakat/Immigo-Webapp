// amplify/functions/transcript/turn/mock-exam-selector.ts
// Deterministic, per-turn question selection for the Standard Interview.
//
// The exam never pre-generates its question list. Each turn asks this module
// for the next item using the learner's recorded history:
//   - mastered questions are reviewed least-recently-seen first (20%),
//   - the remaining 80% is split evenly between unseen and weak questions,
//   - weak questions prioritise previous-exam misses and the lowest mastery.
//
// The running quota is measured over the questions actually asked, so an
// interview that ends early still keeps the intended mix.

import { allItems } from './bank';
import type { CivicsItem, TestVersion } from './types';

export type MockExamQuestionBucket = 'new' | 'weak' | 'review';

export interface MockExamMasterySnapshot {
  itemId: string;
  attempts: number;
  correctCount: number;
  /** Epoch milliseconds of the learner's most recent graded attempt. */
  lastSeenAt: number;
  mastered: boolean;
}

export interface MockExamSelectionInput {
  version: TestVersion;
  askedItemIds: readonly string[];
  mastery: readonly MockExamMasterySnapshot[];
  previousMissItemIds: readonly string[];
}

const TARGET_SHARES: Record<MockExamQuestionBucket, number> = {
  new: 0.4,
  weak: 0.4,
  review: 0.2,
};

const TIE_ORDER: MockExamQuestionBucket[] = ['new', 'weak', 'review'];

export const MAX_EXAM_QUESTIONS: Record<TestVersion, number> = {
  '2008': 10,
  '2020': 20,
};

export function questionBucket(
  itemId: string,
  mastery: ReadonlyMap<string, MockExamMasterySnapshot>,
): MockExamQuestionBucket {
  const snapshot = mastery.get(itemId);
  if (!snapshot || snapshot.attempts <= 0) return 'new';
  return snapshot.mastered ? 'review' : 'weak';
}

function itemOrder(item: CivicsItem): number {
  return item.number ?? Number.MAX_SAFE_INTEGER;
}

function byItemOrder(a: CivicsItem, b: CivicsItem): number {
  const numberDelta = itemOrder(a) - itemOrder(b);
  return numberDelta !== 0 ? numberDelta : a.id.localeCompare(b.id);
}

function masteryPct(snapshot: MockExamMasterySnapshot): number {
  if (snapshot.attempts <= 0) return 0;
  return snapshot.correctCount / snapshot.attempts;
}

function candidatePool(
  bucket: MockExamQuestionBucket,
  input: MockExamSelectionInput,
  mastery: ReadonlyMap<string, MockExamMasterySnapshot>,
  asked: ReadonlySet<string>,
): CivicsItem[] {
  const previousMisses = new Set(input.previousMissItemIds);
  return allItems(input.version)
    .filter(item => !asked.has(item.id))
    .filter(item => questionBucket(item.id, mastery) === bucket)
    .sort((a, b) => {
      const aSnapshot = mastery.get(a.id);
      const bSnapshot = mastery.get(b.id);
      if (bucket === 'review') {
        const aSeen = aSnapshot?.lastSeenAt ?? 0;
        const bSeen = bSnapshot?.lastSeenAt ?? 0;
        if (aSeen !== bSeen) return aSeen - bSeen;
        return byItemOrder(a, b);
      }
      if (bucket === 'weak') {
        const aMiss = previousMisses.has(a.id) ? 1 : 0;
        const bMiss = previousMisses.has(b.id) ? 1 : 0;
        if (aMiss !== bMiss) return bMiss - aMiss;
        const aPct = aSnapshot ? masteryPct(aSnapshot) : 0;
        const bPct = bSnapshot ? masteryPct(bSnapshot) : 0;
        if (aPct !== bPct) return aPct - bPct;
        const aSeen = aSnapshot?.lastSeenAt ?? 0;
        const bSeen = bSnapshot?.lastSeenAt ?? 0;
        if (aSeen !== bSeen) return aSeen - bSeen;
        return byItemOrder(a, b);
      }
      return byItemOrder(a, b);
    });
}

/**
 * Picks the bucket furthest below its running target for the question about to
 * be asked. Tie-breaks are deterministic: new, then weak, then review.
 */
export function selectQuestionBucket(
  input: MockExamSelectionInput,
  mastery: ReadonlyMap<string, MockExamMasterySnapshot>,
): MockExamQuestionBucket {
  const nextTotal = input.askedItemIds.length + 1;
  const askedCounts: Record<MockExamQuestionBucket, number> = { new: 0, weak: 0, review: 0 };
  for (const itemId of input.askedItemIds) askedCounts[questionBucket(itemId, mastery)] += 1;

  let selected: MockExamQuestionBucket = TIE_ORDER[0];
  let selectedDeficit = Number.NEGATIVE_INFINITY;
  for (const bucket of TIE_ORDER) {
    const deficit = TARGET_SHARES[bucket] * nextTotal - askedCounts[bucket];
    if (deficit > selectedDeficit + Number.EPSILON) {
      selected = bucket;
      selectedDeficit = deficit;
    }
  }
  return selected;
}

export function selectNextMockExamItem(input: MockExamSelectionInput): CivicsItem | null {
  if (input.askedItemIds.length >= MAX_EXAM_QUESTIONS[input.version]) return null;

  const mastery = new Map(input.mastery.map(snapshot => [snapshot.itemId, snapshot]));
  const asked = new Set(input.askedItemIds);
  const pools: Record<MockExamQuestionBucket, CivicsItem[]> = {
    new: candidatePool('new', input, mastery, asked),
    weak: candidatePool('weak', input, mastery, asked),
    review: candidatePool('review', input, mastery, asked),
  };

  const preferred = selectQuestionBucket(input, mastery);
  if (pools[preferred].length > 0) return pools[preferred][0];

  // A missing pool must not starve the other quotas. Re-run the deficit
  // comparison over the buckets that actually have candidates.
  const nextTotal = input.askedItemIds.length + 1;
  const askedCounts: Record<MockExamQuestionBucket, number> = { new: 0, weak: 0, review: 0 };
  for (const itemId of input.askedItemIds) askedCounts[questionBucket(itemId, mastery)] += 1;

  let fallback: CivicsItem | null = null;
  let fallbackDeficit = Number.NEGATIVE_INFINITY;
  for (const bucket of TIE_ORDER) {
    if (pools[bucket].length === 0) continue;
    const deficit = TARGET_SHARES[bucket] * nextTotal - askedCounts[bucket];
    if (deficit > fallbackDeficit + Number.EPSILON) {
      fallback = pools[bucket][0];
      fallbackDeficit = deficit;
    }
  }
  return fallback;
}

/**
 * Loads the score facts from the most recently completed interview with a real
 * report. Auto-closed abandoned exams have no report and must not count.
 */
export interface PreviousExamSummary {
  correct: number;
  incorrect: number;
  total: number;
  passed: boolean;
  endedEarly: boolean;
  questionIds: string[];
}

export function summarizePreviousExam(
  version: TestVersion,
  row: {
    correct_count: number;
    incorrect_count: number;
    question_ids?: string[] | null;
  } | null | undefined,
): PreviousExamSummary | null {
  if (!row) return null;
  const passAt = version === '2008' ? 6 : 12;
  const maxQuestions = MAX_EXAM_QUESTIONS[version];
  const correct = Math.max(0, row.correct_count);
  const incorrect = Math.max(0, row.incorrect_count);
  const total = correct + incorrect;
  const passed = correct >= passAt;
  const endedEarly = total < maxQuestions;
  return {
    correct,
    incorrect,
    total,
    passed,
    endedEarly,
    questionIds: row.question_ids ?? [],
  };
}
