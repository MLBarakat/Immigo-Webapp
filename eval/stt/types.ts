// Types for the accent-stratified STT evaluation harness.

/** One evaluation clip. `itemId` (optional) enables the grade-impact lens. */
export interface SttCase {
  /** Path to the audio file (wav/mp3/flac), relative to the manifest. */
  audioPath: string;
  /** L1 / accent stratum label, e.g. "Spanish", "Mandarin", "Vietnamese". */
  accent: string;
  /** Ground-truth transcript of what was said. */
  reference: string;
  /**
   * If set, this clip is a spoken CIVICS ANSWER for this bank item, enabling the
   * grade-impact lens (did STT error flip the grade?). If unset, WER-only.
   */
  itemId?: string;
}

/** A pluggable speech-to-text engine. Wire your Whisper worker/model here. */
export interface SttAdapter {
  readonly name: string;
  /** Transcribe an audio file to text. */
  transcribe(audioPath: string): Promise<string>;
}

/** Governance policy (NOT measured values) — thresholds the gate enforces. */
export interface SttThresholds {
  /** Max acceptable mean WER per accent stratum (0..1). Null => tracked-only. */
  maxWerPerAccent: number | null;
  /** Max acceptable gap between best and worst stratum WER (0..1). Null => tracked-only. */
  maxWerGap: number | null;
  /**
   * Grade-impact hard gate (the product metric): max acceptable false-incorrect
   * rate per accent — correct spoken answers that STT caused to be graded wrong.
   */
  maxFalseIncorrectPerAccent: number;
}
