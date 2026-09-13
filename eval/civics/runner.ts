// eval/civics/runner.ts
// CLI: execute the Civics Safety & Grading Benchmark and block on any false positive.
// Usage: npx tsx eval/civics/runner.ts [benchmark.jsonl]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getItem } from '../../amplify/functions/transcript/turn/bank';
import { resolveTurn } from '../../amplify/functions/transcript/turn/turn-policy';
import type { TurnInterpretation } from '../../amplify/functions/transcript/turn/types';
import { evaluateCase, scoreResults } from './scorer';
import type { CivicsEvalCase, CivicsEvalResult } from './types';

export function runBenchmark(benchmarkPath?: string): { results: CivicsEvalResult[]; summary: ReturnType<typeof scoreResults> } {
  const file = benchmarkPath || resolve(process.cwd(), 'eval/civics/benchmark.jsonl');
  const lines = readFileSync(file, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const cases: CivicsEvalCase[] = lines.map((l) => JSON.parse(l) as CivicsEvalCase);
  const results: CivicsEvalResult[] = [];

  for (const c of cases) {
    const askedItem = getItem(c.itemId);
    if (!askedItem) {
      throw new Error(`Evaluation dataset references unknown bank itemId: ${c.itemId}`);
    }

    // Build candidate interpretation claim
    const simulatedInterp: TurnInterpretation = {
      intent: c.expectedIntent,
      targetItemId: c.itemId,
      grade:
        c.expectedIntent === 'answer'
          ? {
              verdict: c.expectedVerdict || 'incorrect',
              matchedAnswer: c.expectedVerdict === 'correct' ? askedItem.acceptableAnswers[0] : null,
            }
          : null,
      reply: 'Simulated reply text.',
    };

    // Evaluate turn through the authoritative code-enforcement policy
    const outcome = resolveTurn(simulatedInterp, {
      askedItem,
      rawTranscript: c.utterance,
    });

    const evalResult = evaluateCase(c, outcome);
    results.push(evalResult);
  }

  const summary = scoreResults(results);
  return { results, summary };
}

if (process.argv[1]?.includes('runner.ts')) {
  console.log('====================================================');
  console.log('     FOUNDRY CIVICS SAFETY BENCHMARK RUNNER         ');
  console.log('====================================================\n');

  const { summary } = runBenchmark(process.argv[2]);

  console.log(`Total Cases Evaluated:       ${summary.total}`);
  console.log(`False Positives (Target 0):  ${summary.falsePositives} (${summary.falsePositiveRate.toFixed(2)}%)`);
  console.log(`False Negatives (<= 2%):     ${summary.falseNegatives} (${summary.falseNegativeRate.toFixed(2)}%)`);
  console.log(`Safety Containment (100%):   ${summary.safetyContainmentRate.toFixed(2)}%`);
  console.log(`Overall Status:              ${summary.passed ? 'PASSED (0 False Positives)' : 'FAILED'}\n`);

  if (!summary.passed) {
    console.error('Violations Found:');
    for (const r of summary.failureReasons) {
      console.error(` - ${r}`);
    }
    process.exit(1);
  }
}
