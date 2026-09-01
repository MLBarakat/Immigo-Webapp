// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { highPassFilter, trimSilence, conditionAudio } from '../audioConditioning';

const SR = 16000;

// Build a sine wave of a given frequency/amplitude/length.
function sine(freqHz: number, seconds: number, amp = 0.5, sr = SR): Float32Array {
  const n = Math.floor(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / sr);
  return out;
}

function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

describe('highPassFilter', () => {
  it('strongly attenuates low-frequency rumble (30Hz)', () => {
    const rumble = sine(30, 0.5, 0.5);
    const out = highPassFilter(rumble, SR, 80);
    // 30Hz is well below the 80Hz cutoff -> heavily reduced.
    expect(rms(out)).toBeLessThan(rms(rumble) * 0.5);
  });

  it('largely preserves speech-band energy (300Hz)', () => {
    const voice = sine(300, 0.5, 0.5);
    const out = highPassFilter(voice, SR, 80);
    // 300Hz is above cutoff -> mostly retained.
    expect(rms(out)).toBeGreaterThan(rms(voice) * 0.7);
  });

  it('returns empty for empty input and does not mutate input', () => {
    expect(highPassFilter(new Float32Array(0)).length).toBe(0);
    const input = sine(300, 0.1, 0.5);
    const copy = Float32Array.from(input);
    highPassFilter(input);
    expect(input).toEqual(copy);
  });
});

describe('trimSilence', () => {
  it('removes long leading and trailing silence but keeps the speech', () => {
    const silence = new Float32Array(SR); // 1s of zeros
    const speech = sine(300, 0.5, 0.5);   // 0.5s of tone
    const clip = new Float32Array(silence.length + speech.length + silence.length);
    clip.set(silence, 0);
    clip.set(speech, silence.length);
    clip.set(silence, silence.length + speech.length);

    const trimmed = trimSilence(clip, SR);
    // Should be much shorter than original (which was 2.5s).
    expect(trimmed.length).toBeLessThan(clip.length);
    // But must retain roughly the speech region (>= its length, <= speech + padding).
    expect(trimmed.length).toBeGreaterThanOrEqual(speech.length * 0.9);
    expect(rms(trimmed)).toBeGreaterThan(0.2); // speech energy preserved
  });

  it('leaves an all-silence clip untouched (VAD gate handles rejection, not this)', () => {
    const silence = new Float32Array(SR);
    expect(trimSilence(silence, SR).length).toBe(silence.length);
  });

  it('leaves an already-tight clip essentially unchanged', () => {
    const speech = sine(300, 0.5, 0.5);
    const trimmed = trimSilence(speech, SR);
    // Only padding could change it; length should be within a small margin.
    expect(Math.abs(trimmed.length - speech.length)).toBeLessThanOrEqual(Math.floor(0.2 * SR) + 1);
  });
});

describe('conditionAudio', () => {
  it('applies both passes: trims silence around filtered speech', () => {
    const silence = new Float32Array(SR);
    const speech = sine(300, 0.5, 0.5);
    const clip = new Float32Array(silence.length + speech.length + silence.length);
    clip.set(speech, silence.length);

    const out = conditionAudio(clip, SR);
    expect(out.length).toBeLessThan(clip.length);
    expect(out.length).toBeGreaterThan(0);
  });

  it('is safe on empty input', () => {
    expect(conditionAudio(new Float32Array(0), SR).length).toBe(0);
  });
});
