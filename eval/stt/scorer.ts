// Accent-stratified STT scorer with two lenses:
//   1. WER per accent (general robustness).
//   2. Grade-impact per accent (did STT flip a correct answer to wrong?) — the
//      metric that actually matters for this app. Reuses the SAME bank matcher
//      the live grader uses, so the eval mirrors production behavior.
import { wordErrorRate } from './wer';
import type { SttCase, SttThresholds } from './types';
// Reuse the runtime matcher so grade-impact reflects real grading.
import { answerInBank } from '../../amplify/functions/transcript/turn/matching';

export interface Transcribed extends SttCase {
  hypothesis: string;
}

export interface AccentStat {
  accent: string;
  clips: number;
  meanWer: number;
  /** Grade-impact (only over clips with an itemId): */
  graded: number;
  falseIncorrect: number;     // correct answers STT caused to be graded wrong
  falseIncorrectRate: number; // falseIncorrect / graded
}

export interface SttReport {
  adapter: string;
  overallWer: number;
  accents: AccentStat[];
  werGap: number;             // worst - best mean WER across accents
  gatePassed: boolean;
  failures: string[];
  alerts: string[];
}

/**
 * @param bankAnswersById  itemId -> acceptable answers (from the civics bank),
 *   needed for the grade-impact lens. WER-only clips don't require it.
 */
export function scoreStt(
  rows: Transcribed[],
  bankAnswersById: Map<string, string[]>,
  policy: SttThresholds,
  adapterName: string
): SttReport {
  const byAccent = new Map<string, Transcribed[]>();
  for (const r of rows) {
    (byAccent.get(r.accent) ?? byAccent.set(r.accent, []).get(r.accent)!).push(r);
  }

  const accents: AccentStat[] = [];
  let totalWerSum = 0;
  let totalClips = 0;

  for (const [accent, group] of byAccent) {
    let werSum = 0;
    let graded = 0;
    let falseIncorrect = 0;

    for (const r of group) {
      werSum += wordErrorRate(r.reference, r.hypothesis).wer;

      // Grade-impact: only for civics-answer clips.
      if (r.itemId) {
        const answers = bankAnswersById.get(r.itemId);
        if (answers && answers.length > 0) {
          graded++;
          // The reference IS a correct spoken answer, so ground truth is "correct".
          // If the transcript no longer matches the bank, STT flipped it to wrong.
          const stillCorrect = answerInBank(r.hypothesis, answers);
          if (!stillCorrect) falseIncorrect++;
        }
      }
    }

    const meanWer = werSum / group.length;
    totalWerSum += werSum;
    totalClips += group.length;

    accents.push({
      accent,
      clips: group.length,
      meanWer,
      graded,
      falseIncorrect,
      falseIncorrectRate: graded > 0 ? falseIncorrect / graded : 0,
    });
  }

  accents.sort((a, b) => a.accent.localeCompare(b.accent));
  const werValues = accents.map((a) => a.meanWer);
  const werGap = werValues.length ? Math.max(...werValues) - Math.min(...werValues) : 0;

  const failures: string[] = [];
  const alerts: string[] = [];

  for (const a of accents) {
    // Hard gate: grade-impact per accent.
    if (a.graded > 0 && a.falseIncorrectRate > policy.maxFalseIncorrectPerAccent) {
      failures.push(
        `[grade-impact] accent "${a.accent}": ${(a.falseIncorrectRate * 100).toFixed(0)}% correct answers graded wrong (> ${(policy.maxFalseIncorrectPerAccent * 100).toFixed(0)}%)`
      );
    }
    // WER: hard gate if a threshold is set, else tracked-only alert.
    if (policy.maxWerPerAccent !== null && a.meanWer > policy.maxWerPerAccent) {
      failures.push(`[wer] accent "${a.accent}": WER ${(a.meanWer * 100).toFixed(0)}% (> ${(policy.maxWerPerAccent * 100).toFixed(0)}%)`);
    } else if (policy.maxWerPerAccent === null) {
      alerts.push(`[wer tracked] accent "${a.accent}": WER ${(a.meanWer * 100).toFixed(0)}%`);
    }
  }
  if (policy.maxWerGap !== null && werGap > policy.maxWerGap) {
    failures.push(`[fairness] WER gap ${(werGap * 100).toFixed(0)}% across accents (> ${(policy.maxWerGap * 100).toFixed(0)}%)`);
  }

  return {
    adapter: adapterName,
    overallWer: totalClips ? totalWerSum / totalClips : 0,
    accents,
    werGap,
    gatePassed: failures.length === 0,
    failures,
    alerts,
  };
}
