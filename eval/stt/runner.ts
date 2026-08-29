// CLI: run the accent-stratified STT eval and block (non-zero exit) on failure.
//
//   npx tsx eval/stt/runner.ts <manifest.jsonl> [audioBaseDir]
//
// Wire a real adapter (XenovaWhisperAdapter) below once implemented. By default
// this uses MockSttAdapter and expects a `hypothesis` field in the manifest for
// dry-runs of the scoring/gate without a model.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { scoreStt, type Transcribed } from './scorer';
import { wordErrorRate } from './wer';
import type { SttCase, SttThresholds } from './types';
import { MockSttAdapter, XenovaWhisperAdapter } from './adapters';

// Governance policy (edit as you calibrate — these are POLICY, not measurements).
const POLICY: SttThresholds = {
  maxWerPerAccent: null,            // tracked-only until calibrated to your dataset
  maxWerGap: null,
  maxFalseIncorrectPerAccent: 0.05, // HARD gate: <=5% correct answers flipped wrong, per accent
};

function loadBankAnswers(): Map<string, string[]> {
  const bankPath = resolve(process.cwd(), 'amplify/functions/transcript/civics-bank.2020-128.json');
  const bank = JSON.parse(readFileSync(bankPath, 'utf-8')) as { items: Array<{ id: string; acceptableAnswers: string[] }> };
  return new Map(bank.items.map((i) => [i.id, i.acceptableAnswers]));
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('Usage: tsx eval/stt/runner.ts <manifest.jsonl> [audioBaseDir]');
    process.exit(2);
  }
  const baseDir = process.argv[3] || dirname(resolve(manifestPath));

  const cases: SttCase[] = readFileSync(resolve(manifestPath), 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as SttCase);

  // Real engine (mirrors production wasm-simd tier: Xenova/whisper-tiny).
  // For dry-runs, a manifest line carrying a `hypothesis` field short-circuits
  // transcription, so the mock is only used when you explicitly want it.
  const adapter = new XenovaWhisperAdapter();
  void MockSttAdapter; // still exported for tests/dry-runs

  const rows: Transcribed[] = [];
  let dryRunCount = 0;
  for (const c of cases) {
    // Dry-run support: if the manifest carries a `hypothesis`, use it; else transcribe.
    const manifestHypothesis = (c as SttCase & { hypothesis?: string }).hypothesis;
    if (manifestHypothesis !== undefined) {
      dryRunCount++;
      console.log(`  [DRY-RUN] ${c.audioPath} — using manifest "hypothesis", NOT transcribed`);
      rows.push({ ...c, hypothesis: manifestHypothesis });
    } else {
      console.log(`  [TRANSCRIBING] ${c.audioPath} ...`);
      const hypothesis = await adapter.transcribe(resolve(baseDir, c.audioPath));
      rows.push({ ...c, hypothesis });
    }
  }

  if (dryRunCount > 0) {
    console.warn(
      `\n⚠️  ${dryRunCount}/${cases.length} clip(s) used a manifest "hypothesis" field and were ` +
      `NOT actually transcribed by Whisper. If you meant to run real audio through the model, ` +
      `remove the "hypothesis" field from those manifest lines.`
    );
  }

  const report = scoreStt(rows, loadBankAnswers(), POLICY, adapter.name);

  // Diagnostic: surface the WORST clips per accent (highest per-clip WER), not
  // just the first few. A high aggregate WER is usually driven by a small
  // number of pathological clips (hallucinated repetition, silence, a
  // mismatched reference) rather than uniformly bad transcription — this
  // makes those outliers visible instead of averaging them away.
  console.log('\n--- Worst-WER samples per accent (debug) ---');
  const byAccentForDebug = new Map<string, Array<Transcribed & { wer: number }>>();
  for (const r of rows) {
    const wer = wordErrorRate(r.reference, r.hypothesis).wer;
    const list = byAccentForDebug.get(r.accent) ?? [];
    list.push({ ...r, wer });
    byAccentForDebug.set(r.accent, list);
  }
  for (const [accent, list] of byAccentForDebug) {
    const worst = [...list].sort((a, b) => b.wer - a.wer).slice(0, 3);
    console.log(`  [${accent}] worst ${worst.length} of ${list.length} clips:`);
    for (const w of worst) {
      console.log(`    ${w.audioPath}  WER=${(w.wer * 100).toFixed(0)}%`);
      console.log(`      reference : "${w.reference}"`);
      console.log(`      hypothesis: "${w.hypothesis}"`);
    }
  }
  console.log('--- end worst-WER samples ---\n');

  console.log(`\nSTT eval — adapter: ${report.adapter}`);
  console.log(`Overall WER: ${(report.overallWer * 100).toFixed(1)}%   WER gap: ${(report.werGap * 100).toFixed(1)}%`);
  for (const a of report.accents) {
    const gi = a.graded > 0 ? `  grade-impact ${(a.falseIncorrectRate * 100).toFixed(0)}% (${a.falseIncorrect}/${a.graded})` : '';
    console.log(`  ${a.accent.padEnd(12)} clips=${a.clips}  WER=${(a.meanWer * 100).toFixed(1)}%${gi}`);
  }
  report.alerts.forEach((x) => console.log(`  · ${x}`));
  if (report.failures.length) {
    console.error('\nGATE FAILED:');
    report.failures.forEach((f) => console.error(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log('\nGATE PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });