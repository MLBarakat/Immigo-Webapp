import { useEffect, useRef, useCallback, useState, useId } from 'react';
import { logger } from '../logger';
import { MicVAD } from '@ricky0123/vad-web';
import { useTranscription, TranscriptionState } from '../context/TranscriptionContext';
import { reconcileTranscripts } from '../utils/diffReconciliation';
import { createMicrophoneStream } from '../utils/audioUtils';
import { conditionAudio } from '../utils/audioConditioning';
import { markDocTombstone } from '../utils/docTombstone';

export interface WhisperHook {
  currentState: TranscriptionState;
  displayTranscript: string;
  finalTranscript: string;
  isModelLoading: boolean;
  isVadReady: boolean;
  isTranscribing: boolean;
  /** True while lazy init is in flight. Start button shows progress, second tap attaches. */
  isInitializing?: boolean;
  /** Last init failure, retryable on next tap. Never includes mic data. */
  initError?: string | null;
  ensureInitialized?: () => Promise<boolean>;
  prepareMicrophoneAccess: () => Promise<boolean>;
  releasePreparedMicrophone: () => void;
  /** Resolves true only once the mic is provably acquired and capture runs. */
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  clearTranscript: () => void;
  /** Last mic-acquisition failure (never includes audio data). */
  micError?: string | null;
  clearMicError: () => void;
  /** Pause the VAD (e.g. during AI audio playback to prevent self-detection) */
  pauseVAD: () => void;
  /** Resume the VAD (e.g. after AI audio completes + AEC settle window) */
  resumeVAD: () => void;
}

interface WhisperOptions {
  readonly onSpeechStart?: () => void;
}

const LEADER_CHANNEL_NAME = 'immigo-transcription-leader';

type SharedInitStatus = 'idle' | 'initializing' | 'ready' | 'error';

/**
 * Event sinks of the hook instance that currently owns the shared VAD.
 * The MicVAD options delegate through sharedRuntime.handlers so speech
 * events always run against the LIVE instance — never a dead instance's
 * frozen stateRef / unmounted provider after a remount (field case
 * 2026-10-21: post-resume "listening" UI, every segment [FLUSH-BLOCK]ed).
 */
type VadEventHandlers = {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onVADMisfire: () => void;
  onFrameProcessed: (probabilities: { isSpeech?: number }, frame: Float32Array) => void;
};

/**
 * Module-level shared voice runtime. Survives ConversationWorkspace
 * remounts (auth settle re-renders): a remount attaches to the in-flight
 * preload promise instead of cancelling it and restarting the Tiny
 * download from zero — which previously left the mic dead until the
 * second download finished. Never holds mic streams (those stay per-mount
 * via getStream); only the compiled model + worker.
 */
const sharedRuntime: {
  status: SharedInitStatus;
  promise: Promise<boolean> | null;
  worker: Worker | null;
  /** True once the current worker has reported INIT_COMPLETED. */
  workerReady: boolean;
  vad: MicVAD | null;
  /** The stream the shared VAD is currently driving (module-shared so remounts can verify it). */
  micStream: MediaStream | null;
  micAcquirePromise: Promise<MediaStream> | null;
  /**
   * When the current attempt's getUserMedia resolved (0 = not granted yet).
   * startVadBounded resets this per attempt and starts its setup budget only
   * once it flips — time spent answering the permission prompt is user time,
   * not setup time (the two-phase acquisition guard).
   */
  micGrantedAt: number;
  /** Live-instance event sinks the shared VAD's options dispatch through. */
  handlers: VadEventHandlers | null;
  /** instanceId owning `handlers`; unmount clears only its own registration. */
  handlersOwner: string | null;
  error: string | null;
} = { status: 'idle', promise: null, worker: null, workerReady: false, vad: null, micStream: null, micAcquirePromise: null, micGrantedAt: 0, handlers: null, handlersOwner: null, error: null };

/**
 * Phase-B acquisition budget: from mic GRANT to a live, listening VAD (the
 * audio-graph build). iOS may hold getUserMedia open behind its own prompt,
 * and once the stream resolves the VAD still has to build its audio graph —
 * which on a busy main thread has been observed to stall indefinitely. Time
 * out rather than leaving the caller waiting forever with the UI mid-setup.
 */
export const MIC_ACQUISITION_TIMEOUT_MS = 15000;

/**
 * Phase-A hard cap: bounds an UNANSWERED permission prompt (or a
 * getUserMedia that never settles) so the UI can never hang forever.
 * Field case: the user's dwell on the permission prompt counted against the
 * single 15s budget, so on desktop AND mobile the guard fired right as
 * "started micVAD" landed — error status immediately after granting access.
 */
export const MIC_PERMISSION_TIMEOUT_MS = 90000;

/** Grant-poll cadence for the acquisition guard's permission phase. */
const MIC_GRANT_POLL_MS = 250;

/** Permission was never granted within the phase-A hard cap. */
export class MicPermissionTimeoutError extends Error {
  constructor() {
    super('Microphone permission was not granted in time.');
    this.name = 'MicPermissionTimeoutError';
  }
}

/** Granted, but the audio graph did not come up within the phase-B budget. */
export class MicSetupTimeoutError extends Error {
  constructor() {
    super('Microphone setup timed out.');
    this.name = 'MicSetupTimeoutError';
  }
}

/**
 * Generates a high-precision, cryptographically secure Trace ID token for distributed tracking.
 * Complies with FR-015 distributed tracing requirements.
 */
function generateLocalTraceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function buildCloudSocketStartMessage(correlationId: string, language = 'en-US', sampleRate = 16000) {
  return {
    type: 'control',
    action: 'start',
    correlationId,
    settings: { sampleRate, language },
  };
}

export const useWhisper = ({ onSpeechStart }: WhisperOptions = {}): WhisperHook => {
  // Connect directly to the authoritative global state context to prevent split-brain states
  const { state, actions } = useTranscription();

  type InitStatus = 'idle' | 'initializing' | 'ready' | 'error';
  const instanceId = useId();
  const unmountedRef = useRef(false);

  // Local readiness mirrors the module-shared runtime (which survives
  // remounts). Initialized from shared state so remounts never flash
  // stale idle/error or trigger cascading renders in the mount effect.
  const [initStatus, setInitStatus] = useState<InitStatus>(sharedRuntime.status);
  const [initError, setInitError] = useState<string | null>(sharedRuntime.error);
  const [vadInitializedState, setVadInitializedState] = useState<boolean>(sharedRuntime.status === 'ready');
  const [modelReadyState, setModelReadyState] = useState<boolean>(sharedRuntime.status === 'initializing');
  const [micError, setMicError] = useState<string | null>(null);
  const initStatusRef = useRef<InitStatus>(sharedRuntime.status);

  const workerRef = useRef<Worker | null>(null);
  const workerUnavailableRef = useRef(false);
  const vadRef = useRef<MicVAD | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativeRecognizerRef = useRef<any>(null);

  const audioFrameAccumulatorRef = useRef<Float32Array[]>([]);
  const segmentSampleCountRef = useRef(0);
  const segmentEnergySumRef = useRef(0);
  const segmentSpeechProbabilitySumRef = useRef(0);
  const segmentFrameCountRef = useRef(0);
  const activeTraceIdRef = useRef<string>('');
  const isRecordingRef = useRef<boolean>(false);
  // Bumped by stopRecording/teardown so an in-flight mic acquisition can
  // never commit a 'listening' session after capture was cancelled.
  const captureGenerationRef = useRef<number>(0);
  // Single-flight guard: concurrent start taps share one acquisition promise.
  const micAcquisitionRef = useRef<Promise<boolean> | null>(null);
  const speechActiveRef = useRef<boolean>(false);
  const nativeFinalTranscriptRef = useRef('');
  const tabIdRef = useRef<string>('');
  const isLeaderRef = useRef<boolean>(true);
  const leaderChannelRef = useRef<BroadcastChannel | null>(null);

  // State Tracking Mirror reference to feed async event listeners without triggering re-binding loops
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const onSpeechStartRef = useRef(onSpeechStart);
  
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
    onSpeechStartRef.current = onSpeechStart;
  }, [state, actions, onSpeechStart]);

  // Centrally isolated operational threshold feature flags
  const remoteFeatureFlags = useRef({
    infiniteSpeakerCeilingS: 20.0,
    forcedBufferBoundsBytes: 4194304, // 4MB Physical Memory Fence Limit
    emptyHandoffSamplesMin: 3200,    // 200ms at 16kHz
    levenshteinMatchThreshold: 0.85
  });

  /**
   * Concatenates audio frame arrays into a continuous Float32 array block natively.
   */
  const compileAudioPayload = useCallback((chunks: Float32Array[]): Float32Array => {
    let totalSamples = 0;
    for (let i = 0; i < chunks.length; i++) {
      totalSamples += chunks[i].length;
    }
    const continuousBuffer = new Float32Array(totalSamples);
    let currentOffset = 0;
    for (let i = 0; i < chunks.length; i++) {
      continuousBuffer.set(chunks[i], currentOffset);
      currentOffset += chunks[i].length;
    }
    return continuousBuffer;
  }, []);

  const flushActiveSegment = useCallback((reason: 'silence' | 'time-chop' | 'capacity' | 'manual') => {
    if (audioFrameAccumulatorRef.current.length === 0) {
      // INFO, not debug: production drops DEBUG (logger minLevel='INFO'), and
      // this gate is a prime suspect for "transcription never dispatched"
      // field reports. speechActive reads false here on the 'silence' path
      // because onSpeechEnd clears it before calling; the preceding
      // [VAD-CALLBACK] onSpeechEnd line disambiguates ordering.
      logger.info('[FLUSH-BLOCK] Empty segment accumulator; nothing to dispatch.', {
        instanceId,
        gate: 'empty-accumulator',
        reason,
        fsm: stateRef.current.fsm,
        speechActive: speechActiveRef.current,
        isRecording: isRecordingRef.current,
        isLeader: isLeaderRef.current,
      });
      return;
    }

    const rawBuffer = compileAudioPayload(audioFrameAccumulatorRef.current);
    audioFrameAccumulatorRef.current = []; // Instantly clear chunks allocation pool to free headroom

    // TEC-01 (6): on-device audio conditioning — high-pass (~80Hz) to drop room
    // rumble/hum, and trailing-silence trim to reduce end-of-clip hallucination.
    // Pure Float32 in/out; the worker still receives a 16kHz mono buffer.
    const compiledBuffer = conditionAudio(rawBuffer);

    const sampleLength = compiledBuffer.length;
    const minSamplesLimit = remoteFeatureFlags.current.emptyHandoffSamplesMin;

    if (sampleLength > minSamplesLimit) {
      if (workerUnavailableRef.current) {
        actionsRef.current.whisperCancel();
        return;
      }
      if (nativeFinalTranscriptRef.current) {
        // Was a fully silent return (no log anywhere named this exit); now
        // visible so a field capture can distinguish it from the gates below.
        logger.info('[FLUSH-BLOCK] Native final transcript present; suppressing worker dispatch.', {
          instanceId,
          gate: 'native-final-present',
          reason,
          fsm: stateRef.current.fsm,
          nativeFinalLength: nativeFinalTranscriptRef.current.length,
        });
        return;
      }
      if (stateRef.current.fsm !== 'SPECULATIVE') {
        // INFO, not debug: production drops DEBUG (logger minLevel='INFO'),
        // so this rejection was invisible in every field capture.
        logger.info('[FLUSH-BLOCK] FSM not in SPECULATIVE; discarding segment without dispatch.', {
          instanceId,
          gate: 'fsm-not-speculative',
          reason,
          transcriptionState: stateRef.current.fsm,
          audioSeconds: Number((sampleLength / 16_000).toFixed(2)),
          speechActive: speechActiveRef.current,
          isRecording: isRecordingRef.current,
          isLeader: isLeaderRef.current,
        });
        return;
      }
      actionsRef.current.whisperSend(); // Safely advance FSM context directly to 'VERIFYING'

      if (workerRef.current) {
        // Worker expects action: 'TRANSCRIBE' (uppercase) with payload.audio and correlationId.
        // Enforce FR-004: Pass data atomically using zero-copy Transferable Object memory detachment.
        workerRef.current.postMessage({
          action: 'TRANSCRIBE',
          correlationId: activeTraceIdRef.current,
          payload: {
            audio: compiledBuffer,
            config: { language: 'en', task: 'transcribe' }
          }
        }, [compiledBuffer.buffer]);
        // Main-thread mirror of the worker's [WHISPER-INFER] start line.
        // DedicatedWorker console output does NOT reach field log captures
        // (proven 2026-10-20: the worker's [WHISPER-ORT] line provably executed
        // before the adjacent main-thread INIT_COMPLETED line, yet only the
        // main-thread line appeared in the report). Dispatch/complete must
        // therefore be visible HERE. Field reading rule: [WHISPER-DISPATCH]
        // with no [WHISPER-COMPLETE] before the next [BOOT] = killed
        // mid-inference.
        logger.info('[WHISPER-DISPATCH]', {
          reason,
          audioSeconds: Number((sampleLength / 16_000).toFixed(2)),
          fsm: stateRef.current.fsm,
          correlationId: activeTraceIdRef.current,
        });
        markDocTombstone({
          inferAt: new Date().toISOString(),
          inferCompletedAt: null,
          inferErrorAt: null,
        });
      }
    } else {
      logger.warn('Empty Handoff Check Guard Engaged: Audio sample length below thresholds. Suppressing worker dispatch.');
      actionsRef.current.whisperCancel();
    }
  }, [compileAudioPayload, instanceId]);

  // ─── Shared-VAD event sinks ───────────────────────────────────────────────
  // The MicVAD object is module-shared and survives ConversationWorkspace
  // remounts, but its options were originally bound to the creating
  // instance's refs. After a remount those closures ran against the dead
  // instance: a frozen stateRef failed the flush gate and a dead provider
  // swallowed speechOnset (field case 2026-10-21: post-resume "listening"
  // UI, zero dispatches). The options delegate through
  // sharedRuntime.handlers, refreshed below by the live instance.
  const handleVadSpeechStart = useCallback(() => {
    if (!isRecordingRef.current || !isLeaderRef.current) {
      logger.info('[VAD-CALLBACK] onSpeechStart early-return; segment logic not armed.', {
        instanceId,
        isRecording: isRecordingRef.current,
        isLeader: isLeaderRef.current,
        fsm: stateRef.current.fsm,
      });
      return;
    }
    // fsm captured pre-speechOnset: the state speechOnset must
    // transition FROM (a value other than IDLE here = already stuck).
    logger.info('[VAD-CALLBACK] onSpeechStart; arming new segment.', {
      instanceId,
      fsm: stateRef.current.fsm,
    });
    activeTraceIdRef.current = generateLocalTraceId();
    nativeFinalTranscriptRef.current = '';
    speechActiveRef.current = true;
    onSpeechStartRef.current?.();
    segmentSampleCountRef.current = 0;
    segmentEnergySumRef.current = 0;
    segmentSpeechProbabilitySumRef.current = 0;
    segmentFrameCountRef.current = 0;
    actionsRef.current.speechOnset(activeTraceIdRef.current);
    logger.info('[NATIVE-ASR] start (speech onset).', { instanceId });
    try { nativeRecognizerRef.current.start(); } catch { /* ignore */ }
  }, [instanceId]);

  const handleVadSpeechEnd = useCallback(() => {
    if (!isRecordingRef.current) {
      logger.info('[VAD-CALLBACK] onSpeechEnd early-return; recording already stopped.', {
        instanceId,
        fsm: stateRef.current.fsm,
      });
      return;
    }
    // frames = accumulator size at speech end: 0 here means frame
    // accumulation itself was broken (see [FLUSH-BLOCK] for the
    // gates that reject a non-empty segment).
    logger.info('[VAD-CALLBACK] onSpeechEnd; flushing accumulated segment.', {
      instanceId,
      fsm: stateRef.current.fsm,
      frames: audioFrameAccumulatorRef.current.length,
    });
    speechActiveRef.current = false;
    flushActiveSegment('silence');
  }, [flushActiveSegment, instanceId]);

  const handleVadMisfire = useCallback(() => {
    // Misfire bypasses onSpeechEnd entirely; without this line a
    // capture where no flush ever fires cannot distinguish
    // "misfire ate the utterance" from "callback never fired".
    logger.info('[VAD-CALLBACK] onVADMisfire; speech segment discarded before flush.', {
      instanceId,
      fsm: stateRef.current.fsm,
      frames: audioFrameAccumulatorRef.current.length,
    });
    speechActiveRef.current = false;
    actionsRef.current.whisperCancel();
  }, [instanceId]);

  const handleVadFrame = useCallback((probabilities: { isSpeech?: number }, frame: Float32Array) => {
    if (!isRecordingRef.current || !speechActiveRef.current || !isLeaderRef.current) return;
    audioFrameAccumulatorRef.current.push(frame);
    let frameEnergy = 0;
    for (let i = 0; i < frame.length; i++) frameEnergy += frame[i] * frame[i];
    segmentSampleCountRef.current += frame.length;
    segmentEnergySumRef.current += frameEnergy;
    segmentSpeechProbabilitySumRef.current += Number(probabilities?.isSpeech || 0);
    segmentFrameCountRef.current += 1;
    const currentSamplesCount = audioFrameAccumulatorRef.current.reduce((acc, f) => acc + f.length, 0);
    const liveSeconds = currentSamplesCount / 16000;
    const physicalMemoryBytes = currentSamplesCount * 4;
    if (liveSeconds >= remoteFeatureFlags.current.infiniteSpeakerCeilingS) {
      logger.info('Infinite Speaker Guard Engaged: Hard 20-second continuous duration ceiling split pass forced.');
      flushActiveSegment('time-chop');
      activeTraceIdRef.current = generateLocalTraceId();
      speechActiveRef.current = true;
    } else if (physicalMemoryBytes >= remoteFeatureFlags.current.forcedBufferBoundsBytes) {
      logger.warn('Forced Buffer Bounds Fence Engaged: Ingestion memory pool weight limit breached. Flushing arena.');
      flushActiveSegment('capacity');
    }
  }, [flushActiveSegment]);

  // Live-instance registration: runs on mount and whenever a sink identity
  // changes; owner-guarded so a departing instance can only clear its own
  // slot (a later mount's registration is never clobbered by old cleanups).
  useEffect(() => {
    sharedRuntime.handlers = {
      onSpeechStart: handleVadSpeechStart,
      onSpeechEnd: handleVadSpeechEnd,
      onVADMisfire: handleVadMisfire,
      onFrameProcessed: handleVadFrame,
    };
    sharedRuntime.handlersOwner = instanceId;
    return () => {
      if (sharedRuntime.handlersOwner === instanceId) {
        sharedRuntime.handlers = null;
        sharedRuntime.handlersOwner = null;
      }
    };
  }, [handleVadSpeechStart, handleVadSpeechEnd, handleVadMisfire, handleVadFrame, instanceId]);

  const hasSpeechQuality = useCallback(() => {
    const sampleCount = segmentSampleCountRef.current;
    if (sampleCount < remoteFeatureFlags.current.emptyHandoffSamplesMin) return false;

    const rms = Math.sqrt(segmentEnergySumRef.current / sampleCount);
    const averageSpeechProbability = segmentFrameCountRef.current > 0
      ? segmentSpeechProbabilitySumRef.current / segmentFrameCountRef.current
      : 0;

    return rms >= 0.008 && averageSpeechProbability >= 0.7;
  }, []);

  const handleWorkerMessage = useCallback((event: MessageEvent) => {
    const data = event.data || {};
    // Worker wraps all results inside a `payload` object and uses `correlationId` (not `traceId`).
    const status: string = data.status || '';
    const payload = data.payload || {};
    const correlationId: string = data.correlationId || '';

    // For transcription responses, validate that the correlationId matches the active trace.
    // INIT_COMPLETED messages are broadcast-level and should never be filtered.
    const isTranscriptionResponse = status === 'COMPLETED' || status === 'UPDATE';
    if (isTranscriptionResponse && correlationId && correlationId !== activeTraceIdRef.current) {
      logger.warn('Correlation ID mismatch in worker message callback. Discarding stale transcription block.', {
        expected: activeTraceIdRef.current,
        received: correlationId
      });
      return;
    }

    // Process incoming worker thread signaling states using the mirror ref to protect render stability.
    // Worker protocol: INIT_COMPLETED | UPDATE | COMPLETED | ERROR
    switch (status) {
      case 'INIT_COMPLETED':
        // Shared flag: later mounts adopting this worker must be able to tell
        // whether INIT_COMPLETED already fired before they attached.
        sharedRuntime.workerReady = true;
        workerUnavailableRef.current = false;
        // modelReadyState is the BUSY flag (true = compiling): completion
        // clears it so isModelLoading drops and the start control unblocks.
        setModelReadyState(false);
        logger.info(`Whisper worker initialized on tier: ${payload.tier || 'unknown'}`);
        // Model is ready — the FSM will be advanced to LISTENING via startRecording() calls.
        // We do NOT call startSession() here because the user has not yet pressed Start.
        break;
      case 'UPGRADE_READY':
        if (payload.upgradeNote) {
          logger.info(`Whisper worker upgraded to tier: ${payload.tier || 'unknown'}`, { reason: payload.upgradeNote });
        } else {
          logger.info(`Whisper worker upgraded to tier: ${payload.tier || 'unknown'}`);
        }
        break;
      case 'UPGRADE_FAILED':
        logger.warn('Background model upgrade failed; continuing on the fast-loading tier.', {
          tier: payload.tier,
          error: payload.upgradeError,
        });
        break;
      case 'UPDATE':
        if (stateRef.current.fsm === 'VERIFYING' || stateRef.current.fsm === 'SPECULATIVE') {
          const interimText = String(payload.text || '').trim();
          if (interimText) actionsRef.current.speculativeUpdate(interimText);
        }
        break;
      case 'COMPLETED': {
        // Unconditional kill-forensics line (the "Truth ledger" log below only
        // fires while the FSM is VERIFYING): a completed inference must be
        // visible even when the FSM has already moved on, so an
        // inference-in-flight-at-death read is unambiguous.
        logger.info('[WHISPER-COMPLETE]', {
          latencyMs: payload.latencyMs || 0,
          textLength: String(payload.text || '').trim().length,
          fsm: stateRef.current.fsm,
          correlationId,
        });
        markDocTombstone({ inferCompletedAt: new Date().toISOString() });
        if (stateRef.current.fsm === 'VERIFYING') {
          const verifiedTruthString = String(payload.text || '').trim();
          const latencyMs: number = payload.latencyMs || 0;
          logger.info(`Truth ledger validation completed. Latency: ${latencyMs}ms`, { correlationId });

          if (!hasSpeechQuality()) {
            logger.info('Speech quality gate rejected a low-confidence audio segment before chat submission.');
            actionsRef.current.whisperCancel();
            break;
          }

          // Integrate index-anchored token diff reconciliation rules
          const reconciliation = reconcileTranscripts(
            stateRef.current.speculativeText,
            verifiedTruthString,
            remoteFeatureFlags.current.levenshteinMatchThreshold
          );

          actionsRef.current.whisperComplete(reconciliation.reconciledText, latencyMs);
        }
        break;
      }
      case 'ERROR':
        markDocTombstone({ inferErrorAt: new Date().toISOString() });
        sharedRuntime.workerReady = false;
        workerUnavailableRef.current = true;
        setModelReadyState(false);
        logger.error('Background worker thread exception caught in orchestration hook.', {
          error: payload.error,
          stage: payload.stage || 'runtime',
        });
        if (stateRef.current.fsm !== 'FAILED') {
          actionsRef.current.inferenceFailed(payload.error || 'Unknown web worker inference crash exception.');
        }
        if (isRecordingRef.current) {
          if (stateRef.current.fsm !== 'RECOVERING') actionsRef.current.recoveryStart();
          actionsRef.current.recoveryComplete();
        }
        break;
    }
  }, [hasSpeechQuality]);

  const setInitStatusBoth = useCallback((s: InitStatus) => {
    initStatusRef.current = s;
    setInitStatus(s);
  }, []);

  /**
   * Mirrors the module-shared init outcome onto THIS mount. Every mount owns
   * its own useState flags, so a mount that merely attached to the shared
   * promise (remount during preload) would otherwise keep initStatus
   * 'initializing' and a stale busy flag forever — permanently blocking the
   * start control and transcription dispatch for that mount. Safe to call
   * repeatedly; React bails out when values are unchanged.
   */
  const mirrorSharedInitState = useCallback(() => {
    if (unmountedRef.current) return;
    if (sharedRuntime.worker) workerRef.current = sharedRuntime.worker;
    if (sharedRuntime.vad) vadRef.current = sharedRuntime.vad;
    if (sharedRuntime.status === 'ready') {
      setModelReadyState(!sharedRuntime.workerReady);
      if (initStatusRef.current !== 'ready') {
        setVadInitializedState(true);
        setInitStatusBoth('ready');
      }
    } else if (sharedRuntime.status === 'error' && initStatusRef.current !== 'error') {
      setVadInitializedState(false);
      setInitError(sharedRuntime.error);
      setInitStatusBoth('error');
      setModelReadyState(false);
    }
  }, [setInitStatusBoth]);

  const acquireMicStream = useCallback((): Promise<MediaStream> => {
    const existing = sharedRuntime.micStream;
    const hasLiveTrack = existing?.getAudioTracks().some(track => track.readyState === 'live');
    if (existing && hasLiveTrack) {
      sharedRuntime.micGrantedAt = Date.now();
      return Promise.resolve(existing);
    }
    if (sharedRuntime.micAcquirePromise) return sharedRuntime.micAcquirePromise;

    const acquisition = createMicrophoneStream({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }).then(stream => {
      sharedRuntime.micStream = stream;
      sharedRuntime.micGrantedAt = Date.now();
      return stream;
    }).finally(() => {
      sharedRuntime.micAcquirePromise = null;
    });
    sharedRuntime.micAcquirePromise = acquisition;
    return acquisition;
  }, []);

  /**
   * Shared, retryable init. Model download + compile starts on mount
   * (background preload, no mic: startOnLoad:false so getUserMedia is NOT
   * called). Mic is requested later inside vad.start() on the Start tap
   * gesture. The runtime is module-shared: a remount attaches to the
   * in-flight promise instead of cancelling the Tiny download and
   * restarting from zero (which previously left the mic dead). Only the
   * starter mount creates worker/VAD; every mount attaches its own worker
   * message listener and mirrors shared state locally.
   */
  const ensureInitialized = useCallback((): Promise<boolean> => {
    // Attach to shared ready state (e.g. remount after preload finished).
    if (sharedRuntime.status === 'ready' && sharedRuntime.vad && sharedRuntime.worker) {
      // Adopt this mount's worker listener (no-op when already attached) and
      // mirror shared readiness: a fresh mount's useState initializer cannot
      // know whether the worker has already reported INIT_COMPLETED.
      sharedRuntime.worker.addEventListener('message', handleWorkerMessage);
      mirrorSharedInitState();
      return Promise.resolve(true);
    }
    if (sharedRuntime.status === 'initializing' && sharedRuntime.promise) {
      // Reuse the in-flight init instead of restarting it. Adopt the worker
      // listener now — it may have been created after this mount's effect
      // ran, and a missed INIT_COMPLETED/COMPLETED would strand this mount —
      // then mirror the shared outcome once the init settles.
      if (sharedRuntime.worker) {
        sharedRuntime.worker.addEventListener('message', handleWorkerMessage);
      }
      return sharedRuntime.promise.then((ok) => {
        mirrorSharedInitState();
        return ok;
      });
    }
    sharedRuntime.status = 'initializing';
    sharedRuntime.error = null;
    setInitStatusBoth('initializing');
    setInitError(null);
    // Worker shows busy until INIT_COMPLETED arrives — unless this init is a
    // re-entry on an already-completed worker (VAD rebuild after a failed
    // mic start), where busy must stay cleared or the start control latches.
    setModelReadyState(!sharedRuntime.workerReady);

    const promise = (async (): Promise<boolean> => {
      try {
        // Worker (tiny-only on mobile; see selectUpgradeTier).
        if (!sharedRuntime.worker) {
          const worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
          worker.addEventListener('message', handleWorkerMessage);
          sharedRuntime.worker = worker;
          sharedRuntime.workerReady = false;
          workerRef.current = worker;
          // WebGPU probe must never block init: requestAdapter() hangs on
          // some mobile Chrome builds. Race with a timeout, default WASM.
          let supportsWebGpu = false;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const gpu = (navigator as any).gpu;
            if (gpu && typeof gpu.requestAdapter === 'function') {
              const adapter = await Promise.race([
                gpu.requestAdapter(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
              ]);
              supportsWebGpu = adapter != null;
            }
          } catch (probeError) {
            logger.warn('WebGPU adapter probe failed; falling back to WASM tier.', { error: String(probeError) });
            supportsWebGpu = false;
          }
          worker.postMessage({
            action: 'INIT',
            correlationId: `init-${Date.now()}`,
            payload: { config: { useWebGPU: supportsWebGpu } },
          });
        } else if (!workerRef.current) {
          workerRef.current = sharedRuntime.worker;
        }

        // VAD model load only (no getUserMedia until the user explicitly
        // prepares microphone access or starts capture).
        // Created once by the starter mount; remounts reuse sharedRuntime.vad.
        // Callbacks close over the starter mount's refs; TranscriptionContext
        // actions are memoized so they stay valid across remounts.
        if (!sharedRuntime.vad) {
          console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId, tabId: tabIdRef.current, phase: 'init-start' })}`);
          const initializedVad = await MicVAD.new({
            baseAssetPath: '/',
            onnxWASMBasePath: '/assets/js/',
            model: 'legacy',
            startOnLoad: false,
            getStream: acquireMicStream,
            pauseStream: async (stream) => {
              stream.getAudioTracks().forEach((track) => { track.enabled = false; });
            },
            resumeStream: async (stream) => {
              // Never silently resume a corpse: unmount cleanup and iOS
              // suspension can END the tracks of the stream the shared VAD is
              // still holding. Re-enabling flags on ended tracks yields a
              // "listening" session with a dead mic and no new permission
              // request — re-request the microphone instead.
              const tracks = stream.getAudioTracks();
              const hasLiveTrack = tracks.some((track) => track.readyState === 'live');
              if (hasLiveTrack) {
                tracks.forEach((track) => { track.enabled = true; });
                sharedRuntime.micStream = stream;
                return stream;
              }
              logger.warn('VAD resume found a dead mic stream; re-requesting microphone access.');
              return acquireMicStream();
            },
            positiveSpeechThreshold: 0.7,
            negativeSpeechThreshold: 0.65,
            preSpeechPadMs: 500,
            minSpeechMs: 200,
            redemptionMs: 500,
            // Events delegate to the LIVE hook instance through the module
            // slot: this VAD object survives workspace remounts, and bindings
            // captured here to the creating instance's refs ran against a dead
            // instance after one (frozen stateRef gate + dead provider
            // dispatch — field case 2026-10-21). See handleVad* sinks above.
            onSpeechStart: () => sharedRuntime.handlers?.onSpeechStart(),
            onSpeechEnd: () => sharedRuntime.handlers?.onSpeechEnd(),
            onVADMisfire: () => sharedRuntime.handlers?.onVADMisfire(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onFrameProcessed: (probabilities: any, frame: Float32Array) =>
              sharedRuntime.handlers?.onFrameProcessed(probabilities, frame),
          });
          vadRef.current = initializedVad;
          sharedRuntime.vad = initializedVad;
          try { initializedVad.pause(); } catch { /* ignore */ }
          console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId, tabId: tabIdRef.current, phase: 'init-ready' })}`);
        } else if (!vadRef.current) {
          vadRef.current = sharedRuntime.vad;
        }

        sharedRuntime.status = 'ready';
        sharedRuntime.error = null;
        setVadInitializedState(true);
        setInitStatusBoth('ready');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Voice init failed (retryable on next tap).', undefined, { error: message });
        sharedRuntime.status = 'error';
        sharedRuntime.error = message;
        setInitError(message);
        setInitStatusBoth('error');
        setModelReadyState(false);
        // Allow retry: drop failed shared resources so next attempt rebuilds.
        if (sharedRuntime.worker) {
          try { sharedRuntime.worker.terminate(); } catch { /* ignore */ }
        }
        sharedRuntime.worker = null;
        sharedRuntime.workerReady = false;
        sharedRuntime.vad = null;
        workerRef.current = null;
        vadRef.current = null;
        setVadInitializedState(false);
        return false;
      } finally {
        // Only one init runs at a time (status check-then-set is
        // synchronous), so unconditional clear is safe: attachers already
        // hold the promise object.
        sharedRuntime.promise = null;
      }
    })();
    sharedRuntime.promise = promise;
    return promise;
  }, [handleWorkerMessage, setInitStatusBoth, mirrorSharedInitState, instanceId, acquireMicStream]);

  useEffect(() => {
    // The effect can clean up and re-run while the hook instance STAYS
    // mounted (auth-settle remount churn; React StrictMode double-invoke in
    // dev). The cleanup marks the instance unmounted — without this reset
    // the flag is poisoned forever, and post-start verification then
    // discards a provably healthy capture (VAD listening, live stream,
    // generation intact), parking the session in error right after
    // "started micVAD". A genuine unmount never re-runs the effect, so the
    // stale-capture protection there is unaffected.
    unmountedRef.current = false;
    tabIdRef.current = `tab_id_${performance.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // BroadcastChannel tab leader-election implementation to block microphone hardware contention
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(LEADER_CHANNEL_NAME) : null;
    if (channel) {
      leaderChannelRef.current = channel;
      channel.postMessage({ type: 'leader-candidate', tabId: tabIdRef.current });
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'leader-candidate' && tabIdRef.current < String(event.data.tabId)) {
          isLeaderRef.current = false;
          logger.warn('Tab leadership lost: alternative active browser partition detected. Freezing microphone links.');
        }
      };
    }

    // Background preload runs on mount (shared runtime); mic stays
    // gesture-gated. Nothing requests microphone on page mount.

    // Initialize native browser Web Speech API (Optimistic UI Track)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionConstructor) {
      const recognizer = new SpeechRecognitionConstructor();
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.lang = 'en-US';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognizer.onresult = (event: any) => {
        if (!isRecordingRef.current || !isLeaderRef.current) return;

        let interimSequence = '';
        let committedSequence = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            committedSequence += ` ${transcript}`;
          } else {
            interimSequence += event.results[i][0].transcript;
          }
        }

        const cleanedCommittedText = committedSequence.replace(/\s+/g, ' ').trim();
        if (cleanedCommittedText) {
          logger.info('[NATIVE-ASR] final-result committed.', { length: cleanedCommittedText.length });
          nativeFinalTranscriptRef.current += `${nativeFinalTranscriptRef.current ? ' ' : ''}${cleanedCommittedText}`;
          if (workerUnavailableRef.current) {
            actionsRef.current.nativeTranscript(cleanedCommittedText);
          } else {
            const currentState = stateRef.current.fsm;
            if (currentState === 'SPECULATIVE' || currentState === 'VERIFYING') {
              actionsRef.current.whisperComplete(cleanedCommittedText, 0);
            }
          }
        }

        const cleanedInterimText = interimSequence.replace(/\s+/g, ' ').trim();
        if (cleanedInterimText) {
          actionsRef.current.speculativeUpdate(cleanedInterimText);
        }
      };

      recognizer.onend = () => {
        // Enforce active recovery loop to handle sudden cellular/mobile network timeout drops
        const willRestart = isRecordingRef.current && isLeaderRef.current;
        logger.info('[NATIVE-ASR] onend.', { willRestart });
        if (willRestart) {
          try { nativeRecognizerRef.current.start(); } catch { /* Catch overlap executions */ }
        }
      };

      // Forensics only: consume error events so field captures show the native
      // recognizer's failure codes (no behavior depends on these).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognizer.onerror = (event: any) => {
        logger.info('[NATIVE-ASR] error.', { code: event?.error ?? 'unknown' });
      };

      nativeRecognizerRef.current = recognizer;
    }

    // VAD + Worker are created once in ensureInitialized() (background
    // preload on mount) and shared across remounts.

    const isStreamUsable = () => {
      const s = sharedRuntime.micStream;
      if (!s) return false;
      const tracks = s.getAudioTracks();
      return tracks.length > 0 && tracks.some((t) => t.readyState === 'live' && t.enabled);
    };

    const handleBrowserLifecycleVisibilityShift = () => {
      // Pause-only on background. Never destroy/terminate here: iOS GC is
      // not instantaneous and recreating immediately spikes memory.
      if (document.hidden) {
        logger.info('Mobile Lifecycle Suspension Event: Tab contextual backgrounding detected. Freezing hardware channels.');
        try { vadRef.current?.pause(); } catch { /* ignore */ }
        logger.info('[NATIVE-ASR] stop (backgrounding).');
        try { nativeRecognizerRef.current?.stop(); } catch { /* ignore */ }
      } else if (isRecordingRef.current && isLeaderRef.current && vadRef.current) {
        // Revalidate before resume: stream may have ended while suspended.
        const ctx = (vadRef.current as unknown as { _audioContext?: AudioContext })._audioContext;
        if (sharedRuntime.micStream && !isStreamUsable()) {
          logger.warn('Mic stream ended during suspension; awaiting next Start tap to recover.');
          return;
        }
        if (ctx && ctx.state === 'closed') {
          logger.warn('AudioContext closed during suspension; awaiting next Start tap to recover.');
          return;
        }
        logger.info('Mobile Lifecycle Resumption Event: Tab focus restored. Awakening streaming configurations.');
        // Resume may re-request the mic (dead-stream recovery); never leave an
        // async rejection unhandled.
        try {
          void vadRef.current?.start().catch((error: unknown) => {
            logger.warn('VAD resume on foregrounding failed; awaiting next Start tap.', {
              error: error instanceof Error ? error.message : String(error),
            });
          });
        } catch { /* ignore sync throw */ }
        logger.info('[NATIVE-ASR] start (resumption).');
        try { nativeRecognizerRef.current?.start(); } catch { /* ignore */ }
      }
    };

    const handlePageShowBfcacheRestoration = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Do not RESET the worker: if it survived, discarding the loaded
        // model forces a costly reload. Clear stale audio only.
        logger.warn('BFCache Re-activation Core Event Intercepted: Purging old data arrays and clearing state counters.');
        audioFrameAccumulatorRef.current = [];
        if (!workerRef.current || !vadRef.current) return;
        if (isRecordingRef.current && isLeaderRef.current) {
          logger.info('[NATIVE-ASR] start (bfcache resumption).');
          try { nativeRecognizerRef.current?.start(); } catch { /* ignore */ }
        }
      }
    };

    // Attach to the shared runtime when it already exists (remount during
    // preload, or preload finished): mirror refs and listen for worker
    // messages on this mount's handler. Local useState already mirrors
    // shared status via initializers above. The starter mount creates
    // the worker inside ensureInitialized() below.
    if (sharedRuntime.worker) {
      sharedRuntime.worker.addEventListener('message', handleWorkerMessage);
      workerRef.current = sharedRuntime.worker;
    }
    if (sharedRuntime.status === 'ready' && sharedRuntime.vad) {
      vadRef.current = sharedRuntime.vad;
    }

    document.addEventListener('visibilitychange', handleBrowserLifecycleVisibilityShift);
    window.addEventListener('pageshow', handlePageShowBfcacheRestoration);
    const mountedInstanceId = instanceId;
    const mountedTabId = tabIdRef.current;
    console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId: mountedInstanceId, tabId: mountedTabId, phase: 'mount' })}`);

    // Background preload (confirmed behavior): download + compile Tiny +
    // VAD model on page load with NO mic request (startOnLoad:false).
    // Mic fires only inside the Start-tap gesture via vad.start().
    // Text chat stays usable while this runs; voice tap is blocked meanwhile.
    // Shared runtime: remounts attach to the in-flight promise, never restart.
    // Deferred past mount paint so first paint never waits on model load.
    const preloadTimer = window.setTimeout(() => {
      void ensureInitialized().catch(() => undefined);
    }, 0);

    return () => {
      window.clearTimeout(preloadTimer);
      console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId: mountedInstanceId, tabId: mountedTabId, phase: 'unmount' })}`);
      unmountedRef.current = true;
      document.removeEventListener('visibilitychange', handleBrowserLifecycleVisibilityShift);
      window.removeEventListener('pageshow', handlePageShowBfcacheRestoration);

      const leaderChannel = leaderChannelRef.current;
      if (leaderChannel) {
        leaderChannel.close();
        leaderChannelRef.current = null;
      }

      // Detach this mount's worker listener only — the shared worker/VAD
      // survive remounts by design. The module-shared mic stream is stopped
      // so a subsequent mount (or resume) re-requests a fresh device stream
      // instead of driving ended tracks.
      try { void vadRef.current?.pause(); } catch { /* ignore */ }
      sharedRuntime.micStream?.getTracks().forEach((track) => track.stop());
      sharedRuntime.micStream = null;
      logger.info('[NATIVE-ASR] abort (unmount).');
      try { nativeRecognizerRef.current?.abort(); } catch { /* ignore */ }

      const worker = workerRef.current;
      if (worker) {
        worker.removeEventListener('message', handleWorkerMessage);
        workerRef.current = null;
      }
      vadRef.current = null;
    };
  }, [handleWorkerMessage, setInitStatusBoth, instanceId, ensureInitialized, acquireMicStream]);

  /** True when the VAD holds a stream with a track the device is still delivering. */
  const hasLiveMicStream = useCallback((): boolean => {
    const stream = sharedRuntime.micStream;
    if (!stream) return false;
    return stream.getAudioTracks().some((track) => track.readyState === 'live');
  }, []);

  const micAcquisitionErrorMessage =
    'Microphone access is needed for voice practice. Allow microphone access in your browser settings, then try again.';

  /**
   * Best-effort release of a half-started capture. `MicVAD.start()` flips
   * `listening` and connects its audio graph *before* it can throw, so a failed
   * start can leave a live mic and a running frame processor behind; and once
   * MicVAD is in its permanent `errored` state it refuses to start again, so a
   * failed attempt must not poison later taps.
   */
  const abandonCaptureAttempt = useCallback(async () => {
    const vad = vadRef.current;
    if (!vad) return;
    try { await vad.pause(); } catch { /* ignore */ }
    sharedRuntime.micStream?.getTracks().forEach((track) => track.stop());
    sharedRuntime.micStream = null;
  }, []);

  /**
   * Maps a mic-acquisition failure onto an actionable, user-facing message.
   * Never includes device labels or audio data.
   */
  const describeMicFailure = useCallback((error: unknown): string => {
    const name = (error as { name?: string } | null)?.name;
    switch (name) {
      case 'MicPermissionTimeoutError':
        return 'Microphone permission was not granted in time. Allow microphone access when prompted, then tap the mic again.';
      case 'MicSetupTimeoutError':
        return 'The microphone took too long to start. Tap the mic again to retry.';
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Microphone access was blocked. Allow microphone access for this site in your browser settings, then tap the mic again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone was found on this device. Connect a microphone and tap the mic again.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Your microphone is busy or unavailable — another app may be holding it. Close that app and tap the mic again.';
      case 'AbortError':
      case 'OverconstrainedError':
        return 'The microphone could not be started. Check your audio input device and tap the mic again.';
      default:
        return micAcquisitionErrorMessage;
    }
  }, [micAcquisitionErrorMessage]);

  const micPreparationGenerationRef = useRef(0);
  const prepareMicrophoneAccess = useCallback(async (): Promise<boolean> => {
    if (!isLeaderRef.current) return false;
    const generation = ++micPreparationGenerationRef.current;
    try {
      // Called synchronously from the start/consent tap. Requesting the stream
      // before session and exam records load preserves mobile browser gesture
      // activation. MicVAD starts later with this already-authorized stream.
      const stream = await acquireMicStream();
      if (generation !== micPreparationGenerationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        if (sharedRuntime.micStream === stream) sharedRuntime.micStream = null;
        return false;
      }
      setMicError(null);
      return true;
    } catch (error) {
      if (generation === micPreparationGenerationRef.current) setMicError(describeMicFailure(error));
      return false;
    }
  }, [acquireMicStream, describeMicFailure]);

  const releasePreparedMicrophone = useCallback(() => {
    micPreparationGenerationRef.current += 1;
    if (isRecordingRef.current || vadRef.current?.listening) return;
    sharedRuntime.micStream?.getTracks().forEach(track => track.stop());
    sharedRuntime.micStream = null;
    sharedRuntime.micGrantedAt = 0;
  }, []);

  /**
   * Rebuilds the module-shared VAD (reusing the loaded worker) after a
   * capture start proved unusable — MicVAD refuses to retry once errored.
   * Returns the fresh instance, or null if initialization failed.
   */
  const rebuildSharedVadForCapture = useCallback(async (): Promise<MicVAD | null> => {
    const stale = vadRef.current;
    sharedRuntime.vad = null;
    vadRef.current = null;
    try { await stale?.pause(); } catch { /* ignore */ }
    // Drop the old device stream: the rebuilt VAD must request a fresh one.
    sharedRuntime.micStream?.getTracks().forEach((track) => track.stop());
    sharedRuntime.micStream = null;
    setVadInitializedState(false);
    const rebuilt = await ensureInitialized();
    if (!rebuilt) return null;
    return vadRef.current;
  }, [ensureInitialized]);

  /**
   * Acquires the microphone FIRST and only then advances the FSM to
   * LISTENING. This ordering is the contract on both platforms: the UI (and
   * the conversation status) must never advertise "listening" unless mic
   * access is guaranteed and the VAD is actually running on a live stream.
   *
   * Recovery: MicVAD silently no-ops every start() after one failed start
   * ('errored' state) and can hold a dead stream after a remount/suspension.
   * When the post-start verification fails we rebuild the shared VAD once —
   * its fresh start() re-requests the microphone — instead of reporting a
   * listening session with a dead mic.
   */
  const beginCapture = useCallback((): Promise<boolean> => {
    // Concurrent taps share one acquisition instead of racing the VAD.
    if (micAcquisitionRef.current) return micAcquisitionRef.current;
    const generation = ++captureGenerationRef.current;

    const acquisition = (async (): Promise<boolean> => {
      const vad = vadRef.current;
      if (!vad) {
        setMicError(micAcquisitionErrorMessage);
        return false;
      }

      // Guards every await on the VAD: a synchronous throw inside MicVAD's
      // internal promise executor makes start() RESOLVE with undefined rather
      // than reject, and a stalled audio graph never settles at all. Both are
      // bounded here, so the caller can never hang with the UI mid-setup.
      //
      // Two-phase budget (field bug: mic button flipped to error "right after
      // micVAD started" on desktop AND mobile):
      //  - Phase A (permission): getUserMedia sits behind the browser's
      //    permission prompt for as long as the user needs to read it. That
      //    dwell is NOT setup time — bounded only by a hard cap.
      //  - Phase B (setup): once OUR getStream wrapper resolves (grant
      //    recorded in sharedRuntime.micGrantedAt), the 15s budget applies to
      //    the audio-graph build alone.
      const startVadBounded = async (target: MicVAD): Promise<void> => {
        // Fresh attempt: this attempt has not been granted the mic yet, so
        // the guard opens in phase A even if an earlier attempt was granted.
        sharedRuntime.micGrantedAt = 0;
        const startPromise = Promise.resolve(target.start());
        // A timeout does not cancel the underlying start(): queue one pause
        // behind it so a late-settling start cannot flip the VAD back to
        // listening with a stream we have already torn down.
        const settleThenPause = () => {
          void startPromise
            .catch(() => undefined)
            .then(() => { try { return target.pause(); } catch { /* ignore */ } })
            .catch(() => undefined);
        };
        let permissionTimer: number | undefined;
        let grantPollTimer: number | undefined;
        let setupTimer: number | undefined;
        try {
          await Promise.race([
            startPromise,
            new Promise<never>((_, reject) => {
              const fail = (error: Error) => {
                settleThenPause();
                reject(error);
              };
              const armSetupBudget = () => {
                setupTimer = window.setTimeout(
                  () => fail(new MicSetupTimeoutError()),
                  MIC_ACQUISITION_TIMEOUT_MS,
                );
              };
              // Phase A: the prompt may stay open for as long as the user
              // needs — only the hard cap bounds it.
              permissionTimer = window.setTimeout(
                () => fail(new MicPermissionTimeoutError()),
                MIC_PERMISSION_TIMEOUT_MS,
              );
              const pollForGrant = () => {
                if (sharedRuntime.micGrantedAt > 0) {
                  // Granted: the setup budget starts NOW. Prompt dwell never
                  // counts against it.
                  window.clearTimeout(permissionTimer);
                  armSetupBudget();
                  return;
                }
                grantPollTimer = window.setTimeout(pollForGrant, MIC_GRANT_POLL_MS);
              };
              pollForGrant();
            }),
          ]);
        } finally {
          // Promise.race does not cancel the losing branches: if start() won
          // (even by milliseconds), every guard timer must be cleared — a
          // late-fired queued pause would silently kill a HEALTHY, listening
          // VAD after a successful start, with no log line and no error
          // state, leaving the session "listening" on a permanently muted
          // graph.
          // Field case: a cold-cache acquisition took ~14.1s of the 15s
          // budget; capture committed at t+14.1s, the orphaned timer paused
          // the VAD at t+15s, and the mic button errored with zero
          // WARN/ERROR logs after "started micVAD".
          window.clearTimeout(permissionTimer);
          window.clearTimeout(grantPollTimer);
          window.clearTimeout(setupTimer);
        }
      };

      try {
        // Mic is requested here, inside the gesture chain, via getStream /
        // resumeStream. Awaiting it guarantees access before any transition.
        // The `listening` flag and the live stream are both verified after —
        // waiting on the promise alone is not proof that capture is running.
        await startVadBounded(vad);

        // One structured line so any field report of "error right after
        // micVAD started" can be classified from console output alone: which
        // verification input failed, and whether the attempt was still live.
        const streamLive = hasLiveMicStream();
        logger.info('Mic capture post-start verification.', {
          vadListening: vad.listening,
          streamLive,
          generation,
          currentGeneration: captureGenerationRef.current,
          unmounted: unmountedRef.current,
          instanceId,
          tabId: tabIdRef.current,
          msSinceGrant: sharedRuntime.micGrantedAt > 0 ? Date.now() - sharedRuntime.micGrantedAt : null,
        });

        if (!vad.listening || !streamLive) {
          // Cancelled or torn down while acquiring: the stream the VAD just
          // opened belongs to a dead attempt. Release it and report the
          // cancellation — never rebuild on an unmounted instance (its refs
          // can no longer attach a rebuilt VAD, which used to surface as a
          // misleading "could not reacquire the microphone" failure).
          if (generation !== captureGenerationRef.current || unmountedRef.current) {
            logger.warn('Mic acquisition finished after capture was cancelled; releasing without rebuild.', {
              generation,
              currentGeneration: captureGenerationRef.current,
              unmounted: unmountedRef.current,
            });
            await abandonCaptureAttempt();
            isRecordingRef.current = false;
            return false;
          }
          logger.warn('VAD did not come up on a live mic stream; rebuilding the shared VAD once.');
          await abandonCaptureAttempt();
          const rebuiltVad = await rebuildSharedVadForCapture();
          if (!rebuiltVad) {
            throw new Error('Voice pipeline could not reacquire the microphone.');
          }
          await startVadBounded(rebuiltVad);
          if (!rebuiltVad.listening || !hasLiveMicStream()) {
            throw new Error('Microphone stream did not become active.');
          }
        }

        // Capture was cancelled (stop tap / teardown) while the mic was
        // being acquired: do not resurrect the tracker, and undo the start.
        // This path used to be SILENT — an error status with zero log lines.
        if (generation !== captureGenerationRef.current || unmountedRef.current) {
          logger.warn('Mic acquisition superseded by a stop/teardown while starting; discarding the capture.', {
            generation,
            currentGeneration: captureGenerationRef.current,
            unmounted: unmountedRef.current,
            instanceId,
            tabId: tabIdRef.current,
          });
          await abandonCaptureAttempt();
          isRecordingRef.current = false;
          return false;
        }

        // Mic is guaranteed — only now announce listening.
        actionsRef.current.clearTranscript();
        audioFrameAccumulatorRef.current = [];
        isRecordingRef.current = true;

        // Advance the FSM from IDLE → LISTENING only after the mic is live.
        actionsRef.current.startSession();
        logger.info('Authoritative dual-track orchestration loops successfully initialized.');
        return true;
      } catch (error) {
        isRecordingRef.current = false;
        // Release the mic and de-poison the VAD so the next tap can retry
        // instead of silently failing forever.
        await abandonCaptureAttempt();
        if (generation === captureGenerationRef.current && !unmountedRef.current) {
          logger.warn('Microphone acquisition failed; capture will not start.', {
            error: error instanceof Error ? error.message : String(error),
            errorName: (error as { name?: string } | null)?.name,
          });
          setMicError(describeMicFailure(error));
        }
        return false;
      } finally {
        // Single-flight: nothing else can replace this entry while we hold
        // it (concurrent taps reuse the promise), so an unconditional clear
        // is safe.
        micAcquisitionRef.current = null;
      }
    })();

    micAcquisitionRef.current = acquisition;
    return acquisition;
  }, [hasLiveMicStream, rebuildSharedVadForCapture, abandonCaptureAttempt, describeMicFailure, micAcquisitionErrorMessage, instanceId]);

  const startRecordingRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const startRecording = useCallback((): Promise<boolean> => {
    if (!isLeaderRef.current) return Promise.resolve(false);
    // Background preload runs on mount. A tap during preload is blocked by
    // the UI (pulsating); guard here ignores it. A tap after an init error
    // retries once via the shared promise.
    if (initStatusRef.current !== 'ready' || !vadRef.current) {
      if (initStatusRef.current === 'error' || initStatusRef.current === 'idle') {
        const runner = startRecordingRef.current;
        return ensureInitialized().then((ok) => (ok && !unmountedRef.current ? runner() : false));
      }
      logger.info('Voice init still in background; tap ignored until ready.');
      return Promise.resolve(false);
    }

    setMicError(null);
    return beginCapture();
  }, [ensureInitialized, beginCapture]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  const stopRecording = useCallback(() => {
    // Invalidate any in-flight mic acquisition: it must not commit a
    // listening session after the user stopped capture.
    captureGenerationRef.current += 1;
    if (!vadRef.current) return;

    const hasPendingSpeech = speechActiveRef.current || stateRef.current.fsm === 'VERIFYING';
    const pendingBrowserTranscript = stateRef.current.speculativeText.trim();
    
    isRecordingRef.current = false;
    speechActiveRef.current = false;
    
    try { vadRef.current.pause(); } catch { /* ignore */ }
    logger.info('[NATIVE-ASR] stop (manual wind-down).', { finalTranscriptLength: nativeFinalTranscriptRef.current.length });
    try { nativeRecognizerRef.current?.stop(); } catch { /* ignore */ }
    
    if (pendingBrowserTranscript && (stateRef.current.fsm === 'SPECULATIVE' || stateRef.current.fsm === 'VERIFYING')) {
      if (hasSpeechQuality()) {
        actionsRef.current.whisperComplete(pendingBrowserTranscript, 0);
      } else {
        logger.info('Speech quality gate rejected browser transcript before chat submission.');
        audioFrameAccumulatorRef.current = [];
        actionsRef.current.whisperCancel();
      }
    } else {
      flushActiveSegment('manual');
    }
    // Keep an in-flight Whisper result eligible for commitment after capture stops.
    if (!hasPendingSpeech) actionsRef.current.endSession();
    logger.info('Authoritative dual-track orchestration loops successfully wound down.');
  }, [flushActiveSegment, hasSpeechQuality]);

  const pauseVAD = useCallback(() => {
    try { vadRef.current?.pause(); } catch { /* ignore */ }
  }, []);

  const resumeVAD = useCallback(() => {
    // Resume may re-request the mic (dead-stream recovery); never leave an
    // async rejection unhandled.
    try {
      void vadRef.current?.start().catch((error: unknown) => {
        logger.warn('VAD resume failed; awaiting next explicit start.', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } catch { /* ignore sync throw */ }
  }, []);

  return {
    currentState: state.fsm,
    displayTranscript: state.fsm === 'IDLE' ? state.committedText : (state.committedText + ' ' + state.speculativeText).trim(),
    finalTranscript: state.committedText,
    isModelLoading: initStatus === 'initializing' || (initStatus === 'ready' && modelReadyState),
    isVadReady: initStatus === 'ready' && vadInitializedState,
    isTranscribing: state.fsm === 'VERIFYING',
    isInitializing: initStatus === 'initializing',
    initError,
    ensureInitialized,
    prepareMicrophoneAccess,
    releasePreparedMicrophone,
    startRecording,
    stopRecording,
    pauseVAD,
    resumeVAD,
    micError,
    clearMicError: () => setMicError(null),
    clearTranscript: () => actionsRef.current.clearTranscript()
  };
};
