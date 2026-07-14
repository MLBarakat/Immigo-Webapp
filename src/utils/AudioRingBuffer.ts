// src/utils/AudioRingBuffer.ts
//
// Lock-free pre-allocated circular Float32 audio ring buffer with DSP pipeline.
//
// Design:
//   • Single-producer (AudioWorkletProcessor on audio thread), single-consumer
//     (VAD/main thread) pattern. writeIndex is written only by producer;
//     readIndex is written only by consumer → no mutex needed.
//   • Pre-allocated backing store — zero GC pressure during speech capture.
//   • Hard capacity limit: 4MB = 1,048,576 Float32 samples at 16kHz
//     (equivalent to ~65.5 seconds of audio).
//   • Time-chop enforced at 20 seconds (320,000 samples at 16kHz).
//
// DSP Pipeline (applied on export via getSamples()):
//   1. DC Offset Calibration  — 300ms running mean subtraction
//   2. AGC Loudness Normalizer — target -23 LUFS (ITU-R BS.1770)
//   3. Empty/silence guard    — returns null if all samples are below threshold

// ─── Constants ────────────────────────────────────────────────────────────────

/** Sample rate expected from the AudioWorklet (16kHz for Whisper) */
const SAMPLE_RATE = 16_000;

/**
 * Maximum ring buffer capacity: 4MB of Float32 samples.
 * Float32 = 4 bytes → 4MB / 4 = 1,048,576 samples ≈ 65.5s at 16kHz.
 */
const MAX_CAPACITY_SAMPLES = 1_048_576; // 4MB fence

/**
 * Maximum segment length before a mandatory time-chop split.
 * 20 seconds × 16,000 samples/s = 320,000 samples.
 */
const MAX_SEGMENT_SAMPLES = 20 * SAMPLE_RATE; // 320,000 samples

/** RMS power threshold below which audio is considered silence */
const SILENCE_THRESHOLD_RMS = 0.002;

/** Target integrated loudness in LUFS (ITU-R BS.1770-4) */
const TARGET_LUFS = -23;

/** Window size for DC offset estimation (300ms at 16kHz) */
const DC_CALIBRATION_WINDOW = Math.floor(0.3 * SAMPLE_RATE);

// ─── Type Exports ─────────────────────────────────────────────────────────────

export interface RingBufferExport {
    /** Zero-copy Float32 slice ready to be transferred to a Web Worker */
    samples: Float32Array;
    /** Number of samples included in this export */
    sampleCount: number;
    /** Whether the export was time-chopped (hit the 20s hard limit) */
    wasTimeChopped: boolean;
    /** Estimated duration in seconds */
    durationSeconds: number;
}

// ─── AudioRingBuffer Class ────────────────────────────────────────────────────

export class AudioRingBuffer {
    private readonly buffer: Float32Array;
    private readonly capacity: number;
    private writeIndex = 0;
    private readIndex = 0;
    private _availableSamples = 0;

    constructor(capacitySamples: number = MAX_CAPACITY_SAMPLES) {
        this.capacity = Math.min(capacitySamples, MAX_CAPACITY_SAMPLES);
        this.buffer = new Float32Array(this.capacity);
    }

    // ── Write API (audio thread / VAD frame callback) ──────────────────────────

    /**
     * Write a frame of audio samples into the ring buffer.
     * Called from the VAD `onFrameProcessed` callback on the main thread.
     * If the buffer is full, oldest samples are silently overwritten (ring semantics).
     */
    write(frame: Float32Array): void {
        const len = frame.length;
        for (let i = 0; i < len; i++) {
            this.buffer[this.writeIndex] = frame[i];
            this.writeIndex = (this.writeIndex + 1) % this.capacity;
            if (this._availableSamples < this.capacity) {
                this._availableSamples++;
            } else {
                // Overwrite: advance read pointer to maintain ring invariant
                this.readIndex = (this.readIndex + 1) % this.capacity;
            }
        }
    }

    // ── Read API (main thread / flush callbacks) ───────────────────────────────

    /** Returns the number of unread samples currently in the buffer */
    getAvailableSamples(): number {
        return this._availableSamples;
    }

    /** Returns the duration in seconds of all available samples */
    getAvailableDurationSeconds(): number {
        return this._availableSamples / SAMPLE_RATE;
    }

    /**
     * Export a contiguous window of the most-recent `windowSamples` samples,
     * applying the full DSP pipeline (DC offset removal + AGC normalization).
     *
     * Returns null if:
     *  - No samples are available
     *  - The window is shorter than `minSamples`
     *  - The exported window is pure silence (RMS < threshold)
     *
     * The returned Float32Array is a **new allocation** — ownership is safe to
     * transfer to a Web Worker via Transferable Objects.
     */
    getSamples(windowSamples: number, minSamples = 0): RingBufferExport | null {
        if (this._availableSamples === 0) return null;

        // Clamp window to available data and time-chop hard limit
        const rawWindow = Math.min(windowSamples, this._availableSamples);
        const wasTimeChopped = rawWindow >= MAX_SEGMENT_SAMPLES;
        const clampedWindow = Math.min(rawWindow, MAX_SEGMENT_SAMPLES);

        if (clampedWindow < minSamples) return null;

        // Extract the contiguous slice from the ring buffer
        const output = new Float32Array(clampedWindow);
        const startIndex = (this.writeIndex - clampedWindow + this.capacity) % this.capacity;

        for (let i = 0; i < clampedWindow; i++) {
            output[i] = this.buffer[(startIndex + i) % this.capacity];
        }

        // DSP Pipeline Step 1: DC Offset Calibration (300ms running mean)
        this._removeDCOffset(output);

        // DSP Pipeline Step 2: AGC Loudness Normalization (target -23 LUFS)
        const normalized = this._normalizeAGC(output);
        if (normalized === null) return null; // silence gate — skip empty frames

        return {
            samples: normalized,
            sampleCount: normalized.length,
            wasTimeChopped,
            durationSeconds: normalized.length / SAMPLE_RATE,
        };
    }

    /**
     * Consume (advance readIndex past) a given number of samples.
     * Call this after successfully handing off a segment to the worker so that
     * the ring doesn't endlessly re-export the same audio.
     */
    consume(sampleCount: number): void {
        const toConsume = Math.min(sampleCount, this._availableSamples);
        this.readIndex = (this.readIndex + toConsume) % this.capacity;
        this._availableSamples -= toConsume;
    }

    /** Reset the buffer to empty state — call on session end or RECOVERING transition */
    reset(): void {
        this.writeIndex = 0;
        this.readIndex = 0;
        this._availableSamples = 0;
        // Zero the backing store to prevent stale audio from leaking into next session
        this.buffer.fill(0);
    }

    // ── DSP Internals ──────────────────────────────────────────────────────────

    /**
     * Step 1: DC Offset Calibration.
     * Estimates the DC bias from the first `DC_CALIBRATION_WINDOW` samples
     * and subtracts it from the entire frame. Mutates the array in-place.
     */
    private _removeDCOffset(samples: Float32Array): void {
        const calibWindow = Math.min(samples.length, DC_CALIBRATION_WINDOW);
        let dcSum = 0;
        for (let i = 0; i < calibWindow; i++) {
            dcSum += samples[i];
        }
        const dcOffset = dcSum / calibWindow;
        if (Math.abs(dcOffset) > 1e-6) {
            for (let i = 0; i < samples.length; i++) {
                samples[i] -= dcOffset;
            }
        }
    }

    /**
     * Step 2: AGC Loudness Normalization.
     * Computes RMS power and scales the signal to hit TARGET_LUFS.
     * Returns null (silence gate) if RMS is below SILENCE_THRESHOLD_RMS.
     * Returns a new Float32Array — does not mutate the input.
     */
    private _normalizeAGC(samples: Float32Array): Float32Array | null {
        let sumSq = 0;
        for (let i = 0; i < samples.length; i++) {
            sumSq += samples[i] * samples[i];
        }
        const rms = Math.sqrt(sumSq / samples.length);

        // Silence gate
        if (rms < SILENCE_THRESHOLD_RMS) return null;

        // Convert RMS to approximate LUFS (simplified: LUFS ≈ 20·log10(RMS) − 0.691)
        const currentLUFS = 20 * Math.log10(rms) - 0.691;
        const gainDb = TARGET_LUFS - currentLUFS;
        const gainLinear = Math.pow(10, gainDb / 20);

        // Hard clamp to prevent amplification above +20dB (safety guard)
        const safeGain = Math.min(gainLinear, 10.0);

        const output = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            // Hard clip at ±1.0 after gain to prevent clipping distortion
            output[i] = Math.max(-1.0, Math.min(1.0, samples[i] * safeGain));
        }

        return output;
    }
}
