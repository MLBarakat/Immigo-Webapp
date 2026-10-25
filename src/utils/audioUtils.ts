import { logger } from '../logger';

export interface MicrophoneStreamOptions {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  /** Preferred AudioDeviceInfo.deviceId; omit or null to use the system default. */
  deviceId?: string | null;
}

/**
 * Preferred microphone selected in Application Settings. `createMicrophoneStream`
 * reads this when the caller does not pass an explicit deviceId, so the shared
 * VAD stream follows the user's Bluetooth/headset choice without every caller
 * having to thread settings through.
 */
let preferredInputDeviceId: string | null = null;

export function setPreferredInputDeviceId(deviceId: string | null | undefined): void {
  preferredInputDeviceId = deviceId || null;
}

export function getPreferredInputDeviceId(): string | null {
  return preferredInputDeviceId;
}

/**
 * Preferred speaker selected in Application Settings. `DeviceInfo.deviceId`
 * is origin-scoped and stable until the user clears permissions.
 */
let preferredOutputDeviceId: string | null = null;

type SinkCapableMediaElement = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function supportsAudioOutputSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' &&
    typeof (HTMLMediaElement.prototype as SinkCapableMediaElement).setSinkId === 'function';
}

export function setPreferredOutputDeviceId(deviceId: string | null | undefined): void {
  preferredOutputDeviceId = deviceId || null;
  if (sharedPlaybackElement) applyPreferredOutputDevice(sharedPlaybackElement);
}

function applyPreferredOutputDevice(element: HTMLAudioElement): void {
  const sink = (element as SinkCapableMediaElement).setSinkId;
  if (typeof sink !== 'function') return;
  try {
    const result = sink.call(element, preferredOutputDeviceId ?? '');
    if (result && typeof result.catch === 'function') {
      result.catch((error: unknown) => {
        logger.warn('Could not route AI voice playback to the selected speaker.', {
          error: error instanceof Error ? error.message : String(error),
          deviceId: preferredOutputDeviceId,
        });
      });
    }
  } catch (error) {
    logger.warn('Selected speaker routing threw before playback.', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
  const deviceId = options.deviceId !== undefined ? options.deviceId : preferredInputDeviceId;
  return {
    audio: {
      echoCancellation: options.echoCancellation ?? true,
      noiseSuppression: options.noiseSuppression ?? true,
      autoGainControl: options.autoGainControl ?? false, // Disabled by default to prioritize LUFS normalization filtering
      channelCount: { ideal: 1, max: 1 }, // Hard mono-channel restriction constraint
      sampleRate: { ideal: 48000 },       // Target high-quality baseline before polyphase down-sampling
      // `ideal` keeps the session usable if a paired Bluetooth headset is
      // disconnected between settings save and session start.
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
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
 * Shared, long-lived Polly playback element. iOS authorizes media playback
 * PER ELEMENT inside a user gesture, not per document: an element created
 * after the gesture (previously a fresh `new Audio(blobUrl)` per turn) is
 * always blocked. The singleton is created and silent-played inside the
 * Start-tap gesture, then reused for every turn by swapping `src` — the
 * standard iOS workaround.
 */
let sharedPlaybackElement: HTMLAudioElement | null = null;
// Identity of the Audio constructor that produced the singleton. Tests re-stub
// the global Audio between cases; recreating the element when the constructor
// changes keeps test doubles fresh while production (stable constructor) keeps
// one long-lived element.
let sharedPlaybackElementCtor: unknown = null;

function getOrCreateSharedPlaybackElement(): HTMLAudioElement {
  const ctor = typeof Audio !== 'undefined' ? Audio : undefined;
  if (!sharedPlaybackElement || sharedPlaybackElementCtor !== ctor) {
    sharedPlaybackElement = new Audio();
    sharedPlaybackElementCtor = ctor;
    applyPreferredOutputDevice(sharedPlaybackElement);
  }
  return sharedPlaybackElement;
}

// ── Temporary AUDIO-DIAG instrumentation ────────────────────────────────────
// Used to pin down mobile-only Polly playback blocks (NotAllowedError).
// Every entry is prefixed [AUDIO-DIAG] so it is easy to grep in a remote
// console capture. Safe to strip once the mobile autoplay issue is resolved.

/** Timestamp of the most recent real user gesture seen by the page. */
let lastUserGestureAtMs = 0;
let gestureTrackersInstalled = false;

/**
 * Installs capture-phase gesture listeners (passive, no side effects) so
 * diagnostics can report how long ago the last real user interaction was
 * relative to unlock/play attempts. This distinguishes "unlock never ran
 * inside a gesture" from "unlock ran in a gesture but did not stick".
 */
function installGestureTrackers(): void {
  if (gestureTrackersInstalled || typeof window === 'undefined') return;
  gestureTrackersInstalled = true;
  const mark = () => { lastUserGestureAtMs = performance.now(); };
  for (const type of ['pointerdown', 'touchstart', 'click', 'keydown'] as const) {
    window.addEventListener(type, mark, { capture: true, passive: true });
  }
}

if (typeof window !== 'undefined') installGestureTrackers();

/**
 * Snapshot of every autoplay-relevant signal available at call time.
 * Logged before/after unlock and play() attempts so the failing device's
 * console shows exactly which activation/policy condition blocked audio.
 */
export function describeAudioEnvironment(): Record<string, unknown> {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const doc = typeof document !== 'undefined' ? document : undefined;
    // userActivation is the decisive signal: hasBeenActive=false at play()
    // time means the browser does not consider this document activated.
    const activation = nav
      ? (nav as Navigator & { userActivation?: { hasBeenActive: boolean; isActive: boolean } }).userActivation
      : undefined;
    return {
      userAgent: nav?.userAgent,
      visibility: doc?.visibilityState,
      hasFocus: typeof doc?.hasFocus === 'function' ? doc.hasFocus() : undefined,
      hasBeenActive: activation?.hasBeenActive,
      isActive: activation?.isActive,
      msSinceLastUserGesture: lastUserGestureAtMs > 0
        ? Math.round(performance.now() - lastUserGestureAtMs)
        : null,
      sharedAudioContextState: sharedPlaybackContext
        ? (sharedPlaybackContext as AudioContext).state
        : 'never-created',
    };
  } catch (error) {
    return { diagnosticsError: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Unlocks the shared playback element by playing (then immediately pausing)
 * a synthesized silent WAV inside a genuine user gesture. On iOS this is the
 * only thing that authorizes later play() calls on THIS element; a WebAudio
 * silent render or a different media element does not count. Never throws.
 */
function unlockSharedPlaybackElement(): void {
  try {
    // Created eagerly at unlock time so the exact element iOS authorizes
    // inside the gesture is the same one used for every later Polly turn.
    const element = getOrCreateSharedPlaybackElement();
    // Test doubles are plain objects; only a real media element needs (and
    // can take) a silent in-gesture play to become unlocked.
    if (typeof HTMLMediaElement === 'undefined' || !(element instanceof HTMLMediaElement)) return;
    // An actively playing element is by definition already unlocked. Swapping
    // its src to the silent WAV would cut off audible turn audio (e.g. the
    // unlock at the top of sendTextMessage while the previous turn is still
    // speaking) — the old code never touched the playback element here.
    if (!element.paused) return;
    const url = getSilentWavUrl();
    if (!url) return;
    element.preload = 'auto';
    if (element.src !== url) element.src = url;
    // play() must be invoked synchronously inside the gesture; pause as soon
    // as it starts so nothing is ever heard. The promise guard covers engines
    // where play() returns undefined instead of a promise.
    const playResult = element.play();
    if (playResult && typeof playResult.then === 'function') {
      playResult.then(() => {
        logger.info('[AUDIO-DIAG] Silent-unlock media play() RESOLVED — shared playback element unlocked.');
        // Only pause while the element is still on the silent WAV: a newer
        // turn may already have swapped its audio onto the shared element,
        // and pausing then would cut off audible playback.
        if (element.src !== url) return;
        try {
          element.pause();
          element.currentTime = 0;
        } catch {
          // Best-effort only.
        }
      }).catch((error: unknown) => {
        // Should be rare; if it happens, every later Polly play() will very
        // likely be blocked — the gesture-retry safety net covers the residue.
        logger.warn('[AUDIO-DIAG] Silent-unlock media play() REJECTED — playback element unlock FAILED. Later Polly play() calls will very likely be blocked.', {
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          ...describeAudioEnvironment(),
        });
      });
    } else {
      logger.info('[AUDIO-DIAG] Silent-unlock media play() returned no promise (engine treated as unlocked).');
    }
  } catch (error: unknown) {
    // Best-effort only, but record it: a throwing unlock path explains a
    // fully silent mobile session.
    logger.warn('[AUDIO-DIAG] unlockSharedPlaybackElement threw before play() completed.', {
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      ...describeAudioEnvironment(),
    });
  }
}

/**
 * Returns the shared playback element with `blobUrl` as its source. Handlers
 * are cleared before the swap so a previous turn's onended/onerror can never
 * fire for the new audio; callers attach their own generation-guarded
 * handlers afterwards, exactly as with a fresh Audio().
 */
export function acquirePollyPlaybackElement(blobUrl: string): HTMLAudioElement {
  // If no unlock ran first (e.g. a text-mode turn in a document that was never
  // gesture-unlocked), this is a fresh element iOS may block — the caller's
  // gesture-retry safety net handles that case.
  const element = getOrCreateSharedPlaybackElement();
  element.onended = null;
  element.onerror = null;
  element.src = blobUrl;
  if (typeof element.load === 'function') {
    try {
      element.load();
    } catch {
      // Best-effort prefetch hint.
    }
  }
  return element;
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
    logger.info('[AUDIO-DIAG] unlockAudioPlayback() invoked.', describeAudioEnvironment());
    // Media-element unlock first: iOS requires a real media play inside the
    // gesture, which a WebAudio render alone does not satisfy — and it must
    // happen on the SAME element that will later play the Polly audio.
    unlockSharedPlaybackElement();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      logger.warn('[AUDIO-DIAG] No AudioContext constructor available; WebAudio half of unlock skipped.');
      return;
    }
    if (!sharedPlaybackContext) {
      sharedPlaybackContext = new AudioContextClass({ latencyHint: 'interactive' });
    }
    const context = sharedPlaybackContext;
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
      context.resume().then(() => {
        logger.info('[AUDIO-DIAG] Shared AudioContext resume() resolved.', { audioContextState: context.state });
      }).catch((error: unknown) => {
        logger.warn('[AUDIO-DIAG] Shared AudioContext resume() rejected.', {
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          audioContextState: context.state,
        });
      });
    } else {
      logger.info('[AUDIO-DIAG] Shared AudioContext already unlocked.', { audioContextState: context.state });
    }
  } catch {
    // Unlock must never throw into gesture handlers.
  }
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

// ── Speaker test chime ──────────────────────────────────────────────────────

let testChimeDataUrl: string | null = null;

/**
 * Builds a short, pleasant two-tone WAV chime once and caches it as a data URI.
 * A data URI (rather than a blob URL) survives Audio element reuse and avoids
 * lifetime management in settings screens.
 */
function getTestChimeDataUrl(): string | null {
  if (testChimeDataUrl) return testChimeDataUrl;
  try {
    const sampleRate = 22050;
    const durationSeconds = 0.85;
    const sampleCount = Math.floor(sampleRate * durationSeconds);
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    const writeAscii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * 2, true);
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
    view.setUint32(40, sampleCount * 2, true);

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleRate;
      let frequency = 0;
      let envelope = 0;
      if (t < 0.36) {
        frequency = 659.25; // E5
        envelope = Math.min(1, t / 0.02) * Math.min(1, (0.36 - t) / 0.05);
      } else if (t >= 0.43) {
        frequency = 880; // A5
        envelope = Math.min(1, (t - 0.43) / 0.02) * Math.min(1, (durationSeconds - t) / 0.08);
      }
      const sample = frequency === 0
        ? 0
        : Math.sin(2 * Math.PI * frequency * t) * 0.45 * Math.max(0, envelope);
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    testChimeDataUrl = `data:audio/wav;base64,${btoa(binary)}`;
    return testChimeDataUrl;
  } catch (error) {
    logger.warn('Could not synthesize the speaker test chime.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Plays the speaker test chime through the requested output device when the
 * browser supports HTMLMediaElement.setSinkId. Returns false instead of
 * throwing so the settings UI can show a helpful fallback message.
 */
export async function playTestChime(outputDeviceId?: string | null): Promise<boolean> {
  const url = getTestChimeDataUrl();
  if (!url) return false;

  const element = new Audio(url);
  element.volume = 0.7;
  const sink = (element as SinkCapableMediaElement).setSinkId;
  try {
    if (typeof sink === 'function') {
      try {
        await sink.call(element, outputDeviceId || '');
      } catch (sinkError) {
        // The chosen device may have disconnected. Play through the system
        // default rather than failing the whole speaker test.
        logger.warn('Could not route the test chime to the selected speaker; using the system default.', {
          error: sinkError instanceof Error ? sinkError.message : String(sinkError),
          deviceId: outputDeviceId ?? null,
        });
      }
    }
    element.onended = () => {
      element.onended = null;
      element.src = '';
    };
    await element.play();
    return true;
  } catch (error) {
    logger.warn('Speaker test playback failed.', {
      error: error instanceof Error ? error.message : String(error),
      deviceId: outputDeviceId ?? null,
    });
    try {
      element.src = '';
    } catch {
      // Best-effort cleanup only.
    }
    return false;
  }
}