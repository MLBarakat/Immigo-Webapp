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
 * Shared playback AudioContext, created once inside a user gesture.
 * Reused across unlock calls so repeated taps never leak contexts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharedPlaybackContext: any = null;

/**
 * Object URL of a synthesized 100ms silent WAV, built once. A runtime-built
 * blob is used instead of a hardcoded data URI so validity never depends on
 * a hand-typed base64 payload.
 */
let silentWavUrl: string | null = null;

function getSilentWavUrl(): string | null {
  try {
    if (silentWavUrl) return silentWavUrl;
    const sampleRate = 8000;
    const samples = 800; // 100ms of digital silence
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    const writeAscii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, samples * 2, true);
    silentWavUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    return silentWavUrl;
  } catch {
    return null;
  }
}

/**
 * Shared media-element used only for autoplay-policy unlock. A WebAudio
 * silent render alone does not unlock the HTMLAudioElement path on iOS, so a
 * real (silent) media play must also originate inside the gesture.
 */
let sharedUnlockAudio: HTMLAudioElement | null = null;

function playSilentMediaUnlock(): void {
  try {
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return;
    const url = getSilentWavUrl();
    if (!url || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    if (!sharedUnlockAudio) {
      // document.createElement (not `new Audio()`) so test doubles for the
      // global Audio constructor never intercept the silent unlock element.
      const element = document.createElement('audio');
      element.src = url;
      element.preload = 'auto';
      sharedUnlockAudio = element;
    }
    const element = sharedUnlockAudio;
    if (element.src !== url) element.src = url;
    // play() must be invoked synchronously inside the gesture; pause as soon
    // as it starts so nothing is ever heard. The promise guard covers engines
    // where play() returns undefined instead of a promise.
    const playResult = element.play();
    if (playResult && typeof playResult.then === 'function') {
      playResult.then(() => {
        try {
          element.pause();
          element.currentTime = 0;
        } catch {
          // Best-effort only.
        }
      }).catch(() => undefined);
    }
  } catch {
    // Best-effort only.
  }
}

/**
 * Returns the singleton shared playback AudioContext, creating it if needed.
 */
export function getSharedPlaybackContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedPlaybackContext) {
    try {
      sharedPlaybackContext = new AudioContextClass({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
  }
  return sharedPlaybackContext;
}

/**
 * Reset shared context for test isolations.
 */
export function resetSharedPlaybackContextForTesting(): void {
  sharedPlaybackContext = null;
  sharedUnlockAudio = null;
}

/**
 * Unlocks audible playback for mobile browsers. Must be called synchronously
 * inside a genuine user gesture (button tap) — iOS Safari and Chrome Android
 * block audible play() calls that arrive after an async gap unless the page's
 * audio stack was previously unlocked by a gesture. Safe to call on every
 * tap: after the first unlock the context stays running and this is a no-op.
 * Never throws.
 */
export function unlockAudioPlayback(): void {
  try {
    // Media-element unlock first: iOS requires a real media play inside the
    // gesture, which a WebAudio render alone does not satisfy.
    playSilentMediaUnlock();
    const context = getSharedPlaybackContext();
    if (!context) return;
    if (context.state === 'suspended') {
      // The audible-path render must originate inside the gesture (iOS).
      try {
        const buffer = context.createBuffer(1, 1, context.sampleRate);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);
      } catch {
        // Silent-buffer render is best-effort only.
      }
      context.resume().catch(() => undefined);
    }
  } catch {
    // Unlock must never throw into gesture handlers.
  }
}

export interface AudioPlaybackHandle {
  readonly duration: number;
  readonly currentTime: number;
  readonly blobUrl?: string;
  play(): Promise<void>;
  pause(): void;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  cleanup?(): void;
}

export class WebAudioPlaybackNode implements AudioPlaybackHandle {
  private readonly context: AudioContext;
  private readonly audioBuffer: AudioBuffer;
  private source: AudioBufferSourceNode | null = null;
  private startTime: number = 0;
  private isPaused: boolean = false;
  private isEnded: boolean = false;
  public onended: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(context: AudioContext, audioBuffer: AudioBuffer) {
    this.context = context;
    this.audioBuffer = audioBuffer;
  }

  get duration(): number {
    return this.audioBuffer.duration;
  }

  get currentTime(): number {
    if (this.isPaused || this.startTime === 0) return 0;
    const elapsed = this.context.currentTime - this.startTime;
    return Math.max(0, Math.min(this.duration, elapsed));
  }

  async play(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => undefined);
    }
    const source = this.context.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.context.destination);

    source.onended = () => {
      if (this.isEnded) return;
      this.isEnded = true;
      this.onended?.();
    };

    this.startTime = this.context.currentTime;
    source.start(0);
    this.source = source;
  }

  pause(): void {
    if (this.isEnded) return;
    this.isEnded = true;
    this.isPaused = true;
    if (this.source) {
      try {
        this.source.stop(0);
        this.source.disconnect();
      } catch {
        // Source might already have finished or stopped.
      }
      this.source = null;
    }
  }

  cleanup(): void {
    this.onended = null;
    this.onerror = null;
  }
}

export class HtmlAudioPlaybackNode implements AudioPlaybackHandle {
  public readonly element: HTMLAudioElement;
  public readonly blobUrl?: string;

  constructor(element: HTMLAudioElement, blobUrl?: string) {
    this.element = element;
    this.blobUrl = blobUrl;
  }

  get duration(): number {
    return this.element.duration;
  }

  get currentTime(): number {
    return this.element.currentTime;
  }

  get onended(): (() => void) | null {
    return this.element.onended as (() => void) | null;
  }
  set onended(handler: (() => void) | null) {
    this.element.onended = handler;
  }

  get onerror(): (() => void) | null {
    return this.element.onerror as (() => void) | null;
  }
  set onerror(handler: (() => void) | null) {
    this.element.onerror = handler;
  }

  play(): Promise<void> {
    return this.element.play();
  }

  pause(): void {
    this.element.pause();
    this.element.currentTime = 0;
  }

  cleanup(): void {
    this.element.onended = null;
    this.element.onerror = null;
  }
}

/**
 * Creates an audio playback handle for Polly speech audio.
 * On mobile devices, plays via Web Audio API using the pre-unlocked AudioContext
 * so audio plays automatically without requiring additional user gestures.
 * Falls back to HTMLAudioElement in environments where Web Audio is unavailable.
 */
export async function createPlaybackNode(audioData: ArrayBuffer): Promise<AudioPlaybackHandle> {
  const context = getSharedPlaybackContext();
  if (context && typeof context.decodeAudioData === 'function') {
    try {
      if (context.state === 'suspended') {
        await context.resume().catch(() => undefined);
      }
      const copy = audioData.slice(0);
      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        const promise = context.decodeAudioData(copy, resolve, reject);
        if (promise && typeof promise.then === 'function') {
          promise.then(resolve).catch(reject);
        }
      });
      return new WebAudioPlaybackNode(context, audioBuffer);
    } catch (err) {
      logger.warn('WebAudio decode failed; falling back to HTMLAudioElement.', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
  const audioBlobUrl = URL.createObjectURL(audioBlob);
  const element = new Audio(audioBlobUrl);
  return new HtmlAudioPlaybackNode(element, audioBlobUrl);
}

/**
 * Instantiates and returns a cross-platform safe AudioContext profile.
 * Handles browser auto-play suspension states gracefully.
 */
export function initializeAudioContext(): AudioContextProfile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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