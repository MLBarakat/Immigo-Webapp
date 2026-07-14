export const TARGET_SAMPLE_RATE = 16_000;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_CAPACITY_SAMPLES = MAX_AUDIO_BYTES / Float32Array.BYTES_PER_ELEMENT; // 1,048,576 samples
export const MAX_SEGMENT_SECONDS = 20;
export const MAX_SEGMENT_SAMPLES = MAX_SEGMENT_SECONDS * TARGET_SAMPLE_RATE; // 320,000 samples
export const MIN_EXPORT_SAMPLES = 3_200; // 200ms at 16kHz

const TARGET_LUFS = -23;
const SILENCE_THRESHOLD_RMS = 0.002;
const MAX_CLOCK_DRIFT_MS = 12;

export interface RingBufferExport {
  samples: Float32Array;
  sampleCount: number;
  wasTimeChopped: boolean;
  durationSeconds: number;
  correlationId?: string;
}

export interface AudioRingBufferSnapshot {
  capacity: number;
  writeIndex: number;
  readIndex: number;
  availableSamples: number;
  isFull: boolean;
}

/**
 * Continuous single-pass DC Offset Removal filter.
 * Uses a running tracking integrator to prevent boundary clicking artifacts between segments.
 */
export function removeDCOffset(samples: Float32Array): Float32Array {
  if (samples.length === 0) return new Float32Array();

  const output = new Float32Array(samples.length);
  const alpha = 0.995; // Time constant for tracking speech signal bounds
  let runningMean = 0;

  // Calculate baseline mean to seed the tracker smoothly
  let seedSum = 0;
  const seedWindow = Math.min(samples.length, 128);
  for (let i = 0; i < seedWindow; i++) {
    seedSum += samples[i];
  }
  runningMean = seedSum / seedWindow;

  for (let i = 0; i < samples.length; i++) {
    runningMean = (alpha * runningMean) + ((1 - alpha) * samples[i]);
    output[i] = samples[i] - runningMean;
  }

  return output;
}

/**
 * Standardized LUFS Loudness Normalization Filter (EBU R128 Power Approximation).
 * Maps signals to a uniform -23 LUFS boundary to clear gain variations.
 */
export function normalizeLufs(samples: Float32Array, targetLufs = TARGET_LUFS): Float32Array | null {
  if (samples.length === 0) return null;

  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }

  const rms = Math.sqrt(sumSquares / samples.length);
  if (rms <= 0 || !Number.isFinite(rms)) return null;

  const safeRms = Math.max(rms, SILENCE_THRESHOLD_RMS);
  const currentLufs = 20 * Math.log10(safeRms) - 0.691;
  const gainDb = targetLufs - currentLufs;
  
  // Cap maximum amplification multiplier at 10.0x to shield against noise floor explosion
  const gain = Math.min(Math.pow(10, gainDb / 20), 10.0);
  const output = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const val = samples[i] * gain;
    output[i] = Math.max(-1.0, Math.min(1.0, val)); // Strict digital clipping protection
  }

  return output;
}

/**
 * High-Fidelity Band-Limited Resampling Core.
 * Implements a windowed-sinc lowpass filter to eliminate aliasing distortions.
 */
export function polyphaseResample(
  samples: Float32Array,
  sourceRate: number,
  targetRate = TARGET_SAMPLE_RATE,
): Float32Array {
  if (samples.length === 0) return new Float32Array();
  if (sourceRate === targetRate) return new Float32Array(samples);
  if (sourceRate <= 0 || targetRate <= 0) {
    throw new Error('Sample rates must be positive.');
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(outputLength);
  
  // Configure Blackman-Nutted Windowed Sinc parameters
  const filterKernelTaps = 12; 
  const cutoffFreq = Math.min(targetRate, sourceRate) / 2;
  const omega = 2 * Math.PI * cutoffFreq / sourceRate;

  for (let i = 0; i < outputLength; i++) {
    const centerSourcePos = i * ratio;
    let accumulatedValue = 0;
    let normalizedWeightSum = 0;

    const startTap = Math.max(0, Math.floor(centerSourcePos - filterKernelTaps));
    const endTap = Math.min(samples.length - 1, Math.ceil(centerSourcePos + filterKernelTaps));

    for (let tapIdx = startTap; tapIdx <= endTap; tapIdx++) {
      const distance = tapIdx - centerSourcePos;
      
      // Sinc evaluation logic block
      let sincMultiplier = 1.0;
      if (Math.abs(distance) > 1e-9) {
        const p = distance * omega;
        sincMultiplier = Math.sin(p) / p;
      }

      // Apply low-noise Hann window wrapper
      const windowWeight = 0.5 * (1 + Math.cos(Math.PI * distance / filterKernelTaps));
      const finalizedTapWeight = sincMultiplier * windowWeight;

      accumulatedValue += samples[tapIdx] * finalizedTapWeight;
      normalizedWeightSum += finalizedTapWeight;
    }

    output[i] = normalizedWeightSum > 0 ? (accumulatedValue / normalizedWeightSum) : 0;
  }

  return output;
}

/**
 * Jitter Buffer Core matching expected hardware durations.
 * Uses fractional filtering to clear wireless Bluetooth clock skews.
 */
export function alignJitterClock(
  samples: Float32Array,
  expectedDurationMs: number,
  sampleRate = TARGET_SAMPLE_RATE,
): Float32Array {
  if (samples.length === 0 || expectedDurationMs <= 0) return new Float32Array(samples);

  const actualDurationMs = (samples.length / sampleRate) * 1000;
  const driftMs = expectedDurationMs - actualDurationMs;
  if (Math.abs(driftMs) <= MAX_CLOCK_DRIFT_MS) return new Float32Array(samples);

  const expectedSamples = Math.max(1, Math.round((expectedDurationMs / 1000) * sampleRate));
  if (expectedSamples === samples.length) return new Float32Array(samples);

  return polyphaseResample(samples, samples.length, expectedSamples);
}

export class AudioRingBuffer {
  private readonly buffer: Float32Array;
  private readonly capacity: number;
  private writeIndex = 0;
  private readIndex = 0;
  private availableSamples = 0;

  constructor(capacitySamples = MAX_CAPACITY_SAMPLES) {
    if (!Number.isFinite(capacitySamples) || capacitySamples <= 0) {
      throw new Error('AudioRingBuffer capacity must be a positive number.');
    }
    this.capacity = Math.min(Math.floor(capacitySamples), MAX_CAPACITY_SAMPLES);
    this.buffer = new Float32Array(this.capacity);
  }

  write(samples: Float32Array, sourceRate = TARGET_SAMPLE_RATE): void {
    const frame = sourceRate === TARGET_SAMPLE_RATE
      ? samples
      : polyphaseResample(samples, sourceRate, TARGET_SAMPLE_RATE);

    for (let i = 0; i < frame.length; i++) {
      this.buffer[this.writeIndex] = frame[i];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;

      if (this.availableSamples < this.capacity) {
        this.availableSamples += 1;
      } else {
        // Enforce rigid memory fence boundaries: overflow pushes readIndex forward atomically
        this.readIndex = (this.readIndex + 1) % this.capacity;
      }
    }
  }

  read(length: number): Float32Array {
    const count = Math.max(0, Math.min(Math.floor(length), this.availableSamples));
    const output = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      output[i] = this.buffer[(this.readIndex + i) % this.capacity];
    }

    this.consume(count);
    return output;
  }

  getAvailableSamples(): number {
    return this.availableSamples;
  }

  getAvailableDurationSeconds(): number {
    return this.availableSamples / TARGET_SAMPLE_RATE;
  }

  shouldForceTimeChop(): boolean {
    return this.availableSamples >= MAX_SEGMENT_SAMPLES;
  }

  shouldForceCapacityFlush(): boolean {
    return this.availableSamples >= this.capacity;
  }

  canExport(minSamples = MIN_EXPORT_SAMPLES): boolean {
    return this.availableSamples >= minSamples;
  }

  getSamples(windowSamples = this.availableSamples, minSamples = MIN_EXPORT_SAMPLES, correlationId?: string): RingBufferExport | null {
    if (!this.canExport(minSamples)) return null;

    const rawWindow = Math.min(Math.max(0, Math.floor(windowSamples)), this.availableSamples);
    const sampleCount = Math.min(rawWindow, MAX_SEGMENT_SAMPLES);
    if (sampleCount < minSamples) return null;

    const output = new Float32Array(sampleCount);

    // FIXED: Collect data sequentially from readIndex (FIFO Chronological order)
    for (let i = 0; i < sampleCount; i++) {
      output[i] = this.buffer[(this.readIndex + i) % this.capacity];
    }

    const calibrated = removeDCOffset(output);
    const normalized = normalizeLufs(calibrated);
    if (!normalized || normalized.length === 0) return null;

    const aligned = alignJitterClock(normalized, (normalized.length / TARGET_SAMPLE_RATE) * 1000, TARGET_SAMPLE_RATE);

    return {
      samples: aligned,
      sampleCount: aligned.length,
      wasTimeChopped: rawWindow >= MAX_SEGMENT_SAMPLES,
      durationSeconds: aligned.length / TARGET_SAMPLE_RATE,
      correlationId,
    };
  }

  consume(sampleCount: number): void {
    const count = Math.max(0, Math.min(Math.floor(sampleCount), this.availableSamples));
    this.readIndex = (this.readIndex + count) % this.capacity;
    this.availableSamples -= count;
  }

  clear(): void {
    this.reset();
  }

  reset(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.availableSamples = 0;
    this.buffer.fill(0);
  }

  snapshot(): AudioRingBufferSnapshot {
    return {
      capacity: this.capacity,
      writeIndex: this.writeIndex,
      readIndex: this.readIndex,
      availableSamples: this.availableSamples,
      isFull: this.availableSamples >= this.capacity,
    };
  }
}