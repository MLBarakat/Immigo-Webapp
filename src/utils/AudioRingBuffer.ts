export const TARGET_SAMPLE_RATE = 16_000;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_CAPACITY_SAMPLES = MAX_AUDIO_BYTES / Float32Array.BYTES_PER_ELEMENT;
export const MAX_SEGMENT_SECONDS = 20;
export const MAX_SEGMENT_SAMPLES = MAX_SEGMENT_SECONDS * TARGET_SAMPLE_RATE;
export const MIN_EXPORT_SAMPLES = 3_200;

const TARGET_LUFS = -23;
const SILENCE_THRESHOLD_RMS = 0.002;
const DC_CALIBRATION_SECONDS = 0.3;
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

export function removeDCOffset(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): Float32Array {
  if (samples.length === 0) return new Float32Array();

  const output = new Float32Array(samples);
  const calibrationWindow = Math.max(1, Math.min(output.length, Math.floor(DC_CALIBRATION_SECONDS * sampleRate)));
  let sum = 0;

  for (let index = 0; index < calibrationWindow; index += 1) {
    sum += output[index];
  }

  const offset = sum / calibrationWindow;
  if (Math.abs(offset) <= 1e-7) return output;

  const corrected = new Float32Array(output.length);
  for (let index = 0; index < output.length; index += 1) {
    corrected[index] = output[index] - offset;
  }

  let correctedEnergy = 0;
  for (let index = 0; index < corrected.length; index += 1) {
    correctedEnergy += corrected[index] * corrected[index];
  }

  if (correctedEnergy <= 1e-12) {
    return new Float32Array(samples);
  }

  return corrected;
}

export function normalizeLufs(samples: Float32Array, targetLufs = TARGET_LUFS): Float32Array | null {
  if (samples.length === 0) return null;

  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    sumSquares += samples[index] * samples[index];
  }

  const rms = Math.sqrt(sumSquares / samples.length);
  if (rms <= 0) return null;

  const safeRms = Math.max(rms, SILENCE_THRESHOLD_RMS);
  const currentLufs = 20 * Math.log10(safeRms) - 0.691;
  const gainDb = targetLufs - currentLufs;
  const gain = Math.min(Math.pow(10, gainDb / 20), 10);
  const output = new Float32Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    output[index] = Math.max(-1, Math.min(1, samples[index] * gain));
  }

  return output;
}

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

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourcePosition - left;
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }

  return output;
}

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

  const output = new Float32Array(expectedSamples);
  const ratio = samples.length / expectedSamples;

  for (let index = 0; index < expectedSamples; index += 1) {
    const sourcePosition = index * ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourcePosition - left;
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }

  return output;
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

    for (let index = 0; index < frame.length; index += 1) {
      this.buffer[this.writeIndex] = frame[index];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;

      if (this.availableSamples < this.capacity) {
        this.availableSamples += 1;
      } else {
        this.readIndex = (this.readIndex + 1) % this.capacity;
      }
    }
  }

  read(length: number): Float32Array {
    const count = Math.max(0, Math.min(Math.floor(length), this.availableSamples));
    const output = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      output[index] = this.buffer[(this.readIndex + index) % this.capacity];
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
    const startIndex = (this.writeIndex - sampleCount + this.capacity) % this.capacity;

    for (let index = 0; index < sampleCount; index += 1) {
      output[index] = this.buffer[(startIndex + index) % this.capacity];
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
