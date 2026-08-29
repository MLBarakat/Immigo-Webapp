# TEC-01 — Accented-Speech Accuracy & Fairness (STT eval)

This is the **measurement instrument** for TEC-01 — the STT analogue of the REL-01 grading harness. It can't invent accuracy numbers; it measures them once you supply audio. Whisper is known to have materially higher error on non-native accents, so this exists to quantify that for *your* users and gate on fairness.

## Two lenses
1. **WER per accent** — general robustness on a public accented-speech set.
2. **Grade-impact per accent** (the metric that matters for this app) — for clips of people speaking *correct civics answers*, does STT error cause the answer to be **graded wrong**? This reuses the live `answerInBank` matcher, so it mirrors production. The gate is hard on this: a correct answer flipped wrong is the real harm.

## Files
- `wer.ts` — word error rate (S/D/I via edit distance).
- `types.ts` — manifest case, adapter interface, policy thresholds.
- `scorer.ts` — per-accent WER + grade-impact + fairness gate.
- `adapters.ts` — `SttAdapter` interface, `MockSttAdapter` (tests/dry-run), `XenovaWhisperAdapter` (stub to wire your model).
- `runner.ts` — CLI; non-zero exit on gate fail (CI-blocking).
- `manifest.example.jsonl` — clip format.
- `__tests__/stt-eval.test.ts` — proves the math, the gate, and grade-impact (9 tests, green).

## Manifest format (JSONL, one clip per line)
```json
{"audioPath": "clips/spanish_q021_01.wav", "accent": "Spanish", "reference": "one hundred", "itemId": "q-021"}
```
- `itemId` present → grade-impact lens (clip is a spoken correct answer for that bank item).
- `itemId` absent → WER-only (generic accented speech).
- A `hypothesis` field may be included for dry-runs without a model.

## How to run
1. Wire `XenovaWhisperAdapter.transcribe()` to the SAME model/config as `src/workers/whisper.worker.ts` (`{ language: 'en', task: 'transcribe' }`), decoding audio to 16kHz mono Float32. Swap it into `runner.ts`.
2. `npx tsx eval/stt/runner.ts eval/stt/manifest.jsonl clips/`
3. CI: add `"eval:stt": "tsx eval/stt/runner.ts eval/stt/manifest.jsonl"` and gate merges on it once you have a real manifest.

## Datasets (verified) — pick per lens
- **WER lens → L2-ARCTIC.** 24 non-native speakers, six L1s (Arabic, Mandarin, Hindi, Korean, Spanish, Vietnamese), human transcripts; on HuggingFace (`KoelLabs/L2Arctic`). **License: CC BY-NC 4.0 (non-commercial).** Use for internal evaluation only and respect the license; do not ship it or use it to train a commercial model without confirming rights. Its utterances are generic prompts, so it gives WER, not grade-impact.
- **WER lens (permissive) → Mozilla Common Voice.** Accent-labeled, CC0 — a permissive supplement / broader accent coverage.
- **Grade-impact lens → bespoke.** L2-ARCTIC/Common Voice do NOT contain civics answers, so grade-impact needs a small set of clips of people (ideally across the six L1s) saying the actual acceptable answers for a sample of bank items. Even ~5 items × 6 accents × a few speakers is enough to detect a fairness problem. This is the set that protects your users; prioritize collecting it.

## Thresholds are policy, not measurements
`runner.ts` ships with: grade-impact false-incorrect **≤5% per accent (hard gate)**; WER **tracked-only** until you've calibrated a realistic floor against your chosen dataset. Adjust as you learn — but keep the grade-impact gate hard, since that's the user-facing harm.

## T-TEC-01-D — accent-aware recovery (design note)
You already have a **VAD speech-quality gate** in `src/hooks/useWhisper.ts` (`rms >= 0.008 && averageSpeechProbability >= 0.7`). Important: that gate checks **audio clarity**, not **transcription correctness** — clear but accented speech that Whisper mis-transcribes passes it and gets graded wrong. So the VAD gate does NOT close the accent gap.

Recommended recovery path once measurement shows where it's needed:
- Prefer a **confirm-on-mismatch** step over silent wrong-grading: when the interpreter returns `unclear`, or the transcript matches no bank answer for the asked item, reply "I heard '<transcript>' — is that right? Say it again if not" instead of committing `incorrect`. This converts an STT miss into a retry, not a false failure, and it's accent-neutral.
- If your Whisper build exposes avg log-prob / no-speech-prob, add a low-confidence threshold that triggers the same confirm step.
- Re-run this harness after adding recovery to confirm the per-accent grade-impact gap actually shrinks.
