// Audio conditioning applied on-device before speech-to-text (TEC-01, solution 6).
//
// Two cheap, dependency-free passes that improve robustness on real-world mic
// input WITHOUT touching pronunciation:
//   1. High-pass filter (~80Hz) — removes sub-vocal room rumble, AC hum, and
//      handling noise that can nudge the model toward spurious tokens.
//   2. Trim leading/trailing near-silence — trailing silence in particular is a
//      known trigger for Whisper end-of-clip repetition hallucination.
//
// These operate on the raw 16kHz mono Float32 buffer the worker already expects,
// so no Web Audio graph / AudioContext is required (works in the worklet path and
// is trivially unit-testable in Node).

export const DEFAULT_SAMPLE_RATE = 16000;

/**
 * One-pole high-pass filter. cutoffHz ~80 removes low-frequency rumble while
 * leaving speech (fundamentals typically 85Hz+) essentially untouched.
 * Returns a new Float32Array; does not mutate the input.
 */
export function highPassFilter(
  input: Float32Array,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  cutoffHz = 80
): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  // Standard one-pole high-pass coefficient.
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);

  const out = new Float32Array(input.length);
  let prevIn = input[0];
  let prevOut = 0;
  out[0] = 0;
  for (let i = 1; i < input.length; i++) {
    const cur = input[i];
    prevOut = alpha * (prevOut + cur - prevIn);
    out[i] = prevOut;
    prevIn = cur;
  }
  return out;
}

/**
 * Trim leading and trailing samples whose short-window RMS is below `threshold`.
 * Keeps a small `padSeconds` cushion around detected speech so we don't clip
 * onsets/offsets. Returns a subarray view when possible (zero-copy) or the
 * original if nothing is trimmable.
 */
export function trimSilence(
  input: Float32Array,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  threshold = 0.0075,
  windowMs = 20,
  padSeconds = 0.1
): Float32Array {
  if (input.length === 0) return input;
  const win = Math.max(1, Math.floor((windowMs / 1000) * sampleRate));

  const windowRms = (start: number): number => {
    let sum = 0;
    const end = Math.min(start + win, input.length);
    for (let i = start; i < end; i++) sum += input[i] * input[i];
    return Math.sqrt(sum / (end - start));
  };

  // Find first/last window above threshold.
  let firstActive = -1;
  let lastActive = -1;
  for (let s = 0; s < input.length; s += win) {
    if (windowRms(s) >= threshold) {
      if (firstActive === -1) firstActive = s;
      lastActive = s;
    }
  }

  // Entirely silent (or below threshold) -> return as-is; the existing VAD
  // quality gate is responsible for rejecting non-speech, not this trimmer.
  if (firstActive === -1) return input;

  const pad = Math.floor(padSeconds * sampleRate);
  const start = Math.max(0, firstActive - pad);
  const end = Math.min(input.length, lastActive + win + pad);
  if (start === 0 && end === input.length) return input;
  return input.subarray(start, end);
}

/**
 * Full conditioning pass: high-pass then silence-trim. Order matters — filter
 * first so the trimmer's RMS gate isn't fooled by low-frequency rumble.
 */
export function conditionAudio(
  input: Float32Array,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): Float32Array {
  if (input.length === 0) return input;
  const filtered = highPassFilter(input, sampleRate);
  return trimSilence(filtered, sampleRate);
}
