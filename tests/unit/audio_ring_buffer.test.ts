import { describe, expect, it } from 'vitest';
import {
  alignJitterClock,
  AudioRingBuffer,
  MAX_SEGMENT_SAMPLES,
  MIN_EXPORT_SAMPLES,
  TARGET_SAMPLE_RATE,
} from '../../src/utils/AudioRingBuffer';

describe('AudioRingBuffer', () => {
  it('aligns jittered audio to the expected duration', () => {
    const input = new Float32Array(8_000);
    for (let index = 0; index < input.length; index += 1) {
      input[index] = index % 2 === 0 ? 0.5 : -0.5;
    }

    const aligned = alignJitterClock(input, 500);
    expect(aligned.length).toBe(8_000);
    expect(aligned[0]).toBeCloseTo(0.5, 5);
    expect(aligned[aligned.length - 1]).toBeCloseTo(-0.5, 5);
  });

  it('exports only segments that meet the minimum sample threshold', () => {
    const buffer = new AudioRingBuffer();
    const samples = new Float32Array(MIN_EXPORT_SAMPLES);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin(index / 32) * 0.1;
    }

    buffer.write(samples, TARGET_SAMPLE_RATE);
    const segment = buffer.getSamples(MIN_EXPORT_SAMPLES, MIN_EXPORT_SAMPLES, 'segment-1');

    expect(segment).not.toBeNull();
    expect(segment?.sampleCount).toBe(MIN_EXPORT_SAMPLES);
    expect(segment?.wasTimeChopped).toBe(false);
  });

  it('time-chops oversized windows to the hard segment cap', () => {
    const buffer = new AudioRingBuffer();
    const largeWindow = new Float32Array(MAX_SEGMENT_SAMPLES + 1_000);
    for (let index = 0; index < largeWindow.length; index += 1) {
      largeWindow[index] = Math.sin(index / 64) * 0.25;
    }

    buffer.write(largeWindow, TARGET_SAMPLE_RATE);
    const segment = buffer.getSamples(largeWindow.length, MIN_EXPORT_SAMPLES, 'segment-2');

    expect(segment).not.toBeNull();
    expect(segment?.sampleCount).toBe(MAX_SEGMENT_SAMPLES);
    expect(segment?.wasTimeChopped).toBe(true);
  });
});
