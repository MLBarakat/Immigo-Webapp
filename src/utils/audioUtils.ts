import { logger } from '../logger';

export interface MicrophoneStreamOptions {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface AudioContextProfile {
  context: AudioContext;
  sampleRate: number;
  isSuspended: boolean;
}

/**
 * Standardized media capture device constraint factory.
 * Enforces FR-005-B channel bounds, isolating mono recording lanes.
 */
export function getMicrophoneConstraints(options: MicrophoneStreamOptions = {}): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: options.echoCancellation ?? true,
      noiseSuppression: options.noiseSuppression ?? true,
      autoGainControl: options.autoGainControl ?? false, // Disabled by default to prioritize LUFS normalization filtering
      channelCount: { ideal: 1, max: 1 }, // Hard mono-channel restriction constraint
      sampleRate: { ideal: 48000 },       // Target high-quality baseline before polyphase down-sampling
    },
    video: false
  };
}

/**
 * Safely requests a hardware microphone device link using strict isolated constraints.
 */
export async function createMicrophoneStream(options: MicrophoneStreamOptions = {}): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Hardware Environment Exception: MediaDevices capture interface is unsupported by this browser context.');
  }

  const constraints = getMicrophoneConstraints(options);
  try {
    logger.info('Requesting secure hardware microphone stream link permissions.');
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    logger.error('Hardware access exception: microphone stream request denied.', undefined, {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Instantiates and returns a cross-platform safe AudioContext profile.
 * Handles browser auto-play suspension states gracefully.
 */
export function initializeAudioContext(): AudioContextProfile {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Runtime Environment Exception: Web Audio API context class is unsupported by this browser engine.');
  }

  const context = new AudioContextClass({
    latencyHint: 'interactive' // Optimizes hardware loops for real-time speech ingestion latency
  });

  return {
    context,
    sampleRate: context.sampleRate,
    isSuspended: context.state === 'suspended'
  };
}

/**
 * Computes the root-mean-square (RMS) energy level of an active Float32 frame block.
 * Utilized for inline hardware mute detection and silent frame tracking.
 */
export function calculateFrameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < frame.length; i++) {
    sumSquares += frame[i] * frame[i];
  }

  const meanSquare = sumSquares / frame.length;
  return Math.sqrt(meanSquare);
}

/**
 * Converts a raw Float32 audio signal frame into a standardized Decibel (dBFS) value.
 * Safely clamps outputs to a -100 dB floor to protect downstream visual dashboard components.
 */
export function calculateFrameDecibels(frame: Float32Array): number {
  const rms = calculateFrameRms(frame);
  if (rms <= 0) return -100;

  const db = 20 * Math.log10(rms);
  return Math.max(-100, Math.min(0, db)); // Clamped between absolute digital silence and full clipping scale
}

/**
 * Helper utility to concatenate an un-allocated array slice of Float32 audio chunks.
 * Performs linear allocation loops exactly once to preserve memory boundaries.
 */
export function mergeAudioSegments(chunks: Float32Array[]): Float32Array {
  if (chunks.length === 0) return new Float32Array();
  if (chunks.length === 1) return new Float32Array(chunks[0]);

  let totalLength = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLength += chunks[i].length;
  }

  const continuousBuffer = new Float32Array(totalLength);
  let currentOffset = 0;

  for (let i = 0; i < chunks.length; i++) {
    continuousBuffer.set(chunks[i], currentOffset);
    currentOffset += chunks[i].length;
  }

  return continuousBuffer;
}

/**
 * Validates that an incoming audio buffer structure satisfies the baseline operational constraints
 * before forwarding payloads to the background web worker thread.
 */
export function validateAudioPayload(audio: Float32Array, minSamples = 3200): boolean {
  if (!audio || audio.length < minSamples) return false;

  // Verify that the payload is not comprised entirely of flat zero sequences (Hardware mute guard)
  let nonZeroCount = 0;
  const auditWindow = Math.min(audio.length, 512); // Sample a subset of frames to preserve thread headroom
  
  for (let i = 0; i < auditWindow; i++) {
    if (Math.abs(audio[i]) > 1e-5) {
      nonZeroCount += 1;
    }
  }

  return nonZeroCount > 0;
}