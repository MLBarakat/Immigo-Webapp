import { useEffect, useRef, useCallback, useState, useId } from 'react';
import { logger } from '../logger';
import { MicVAD } from '@ricky0123/vad-web';
import { useTranscription, TranscriptionState } from '../context/TranscriptionContext';
import { reconcileTranscripts } from '../utils/diffReconciliation';
import { createMicrophoneStream } from '../utils/audioUtils';
import { conditionAudio } from '../utils/audioConditioning';

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
  error: string | null;
} = { status: 'idle', promise: null, worker: null, workerReady: false, vad: null, micStream: null, error: null };

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
      logger.debug('Blocked empty transcription segment flush pass.', { reason });
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
      if (nativeFinalTranscriptRef.current) return;
      if (stateRef.current.fsm !== 'SPECULATIVE') {
        logger.debug('Skipping a local transcription segment that no longer has an active speech state.', {
          reason,
          transcriptionState: stateRef.current.fsm,
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
      }
    } else {
      logger.warn('Empty Handoff Check Guard Engaged: Audio sample length below thresholds. Suppressing worker dispatch.');
      actionsRef.current.whisperCancel();
    }
  }, [compileAudioPayload]);

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

        // VAD model load only (no getUserMedia until vad.start()).
        // Created once by the starter mount; remounts reuse sharedRuntime.vad.
        // Callbacks close over the starter mount's refs; TranscriptionContext
        // actions are memoized so they stay valid across remounts.
        const acquireMicStream = async () => {
          const stream = await createMicrophoneStream({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
          sharedRuntime.micStream = stream;
          return stream;
        };
        if (!sharedRuntime.vad) {
          console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId, tabId: tabIdRef.current, phase: 'init-start' })}`);
          const initializedVad = await MicVAD.new({
            baseAssetPath: '/',
            onnxWASMBasePath: '/assets/js/',
            model: 'legacy',
            startOnLoad: false,
            getStream: async () => acquireMicStream(),
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
            onSpeechStart: () => {
              if (!isRecordingRef.current || !isLeaderRef.current) return;
              activeTraceIdRef.current = generateLocalTraceId();
              nativeFinalTranscriptRef.current = '';
              speechActiveRef.current = true;
              onSpeechStartRef.current?.();
              segmentSampleCountRef.current = 0;
              segmentEnergySumRef.current = 0;
              segmentSpeechProbabilitySumRef.current = 0;
              segmentFrameCountRef.current = 0;
              actionsRef.current.speechOnset(activeTraceIdRef.current);
              try { nativeRecognizerRef.current.start(); } catch { /* ignore */ }
            },
            onSpeechEnd: () => {
              if (!isRecordingRef.current) return;
              speechActiveRef.current = false;
              flushActiveSegment('silence');
            },
            onVADMisfire: () => {
              speechActiveRef.current = false;
              actionsRef.current.whisperCancel();
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onFrameProcessed: (probabilities: any, frame: Float32Array) => {
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
            }
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
  }, [handleWorkerMessage, flushActiveSegment, setInitStatusBoth, mirrorSharedInitState, instanceId]);

  useEffect(() => {
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
        if (isRecordingRef.current && isLeaderRef.current) {
          try { nativeRecognizerRef.current.start(); } catch { /* Catch overlap executions */ }
        }
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
      try { nativeRecognizerRef.current?.abort(); } catch { /* ignore */ }

      const worker = workerRef.current;
      if (worker) {
        worker.removeEventListener('message', handleWorkerMessage);
        workerRef.current = null;
      }
      vadRef.current = null;
    };
  }, [handleWorkerMessage, setInitStatusBoth, instanceId, ensureInitialized]);

  /** True when the VAD holds a stream with a track the device is still delivering. */
  const hasLiveMicStream = useCallback((): boolean => {
    const stream = sharedRuntime.micStream;
    if (!stream) return false;
    return stream.getAudioTracks().some((track) => track.readyState === 'live');
  }, []);

  const micAcquisitionErrorMessage =
    'Microphone access is needed for voice practice. Allow microphone access in your browser settings, then try again.';

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
      if (!vad) return false;
      try {
        // Mic is requested here, inside the gesture chain, via getStream /
        // resumeStream. Awaiting it guarantees access before any transition.
        await vad.start();

        if (!vad.listening || !hasLiveMicStream()) {
          logger.warn('VAD did not come up on a live mic stream; rebuilding the shared VAD once.');
          const rebuiltVad = await rebuildSharedVadForCapture();
          if (!rebuiltVad) {
            throw new Error('Voice pipeline could not reacquire the microphone.');
          }
          await rebuiltVad.start();
          if (!rebuiltVad.listening || !hasLiveMicStream()) {
            throw new Error('Microphone stream did not become active.');
          }
        }

        // Capture was cancelled (stop tap / teardown) while the mic was
        // being acquired: do not resurrect the tracker, and undo the start.
        if (generation !== captureGenerationRef.current || unmountedRef.current) {
          try { vadRef.current?.pause(); } catch { /* ignore */ }
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
        if (generation === captureGenerationRef.current && !unmountedRef.current) {
          logger.warn('Microphone acquisition failed; capture will not start.', {
            error: error instanceof Error ? error.message : String(error),
          });
          setMicError(micAcquisitionErrorMessage);
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
  }, [hasLiveMicStream, rebuildSharedVadForCapture]);

  const startRecordingRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const startRecording = useCallback((): Promise<boolean> => {
    if (!isLeaderRef.current) return Promise.resolve(false);
    // Background preload runs on mount. A tap during preload is blocked by
    // the UI (pulsating); guard here ignores it. A tap after an init error
    // retries once via the shared promise.
    if (initStatusRef.current !== 'ready' || !vadRef.current) {
      if (initStatusRef.current === 'error') {
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
    startRecording,
    stopRecording,
    pauseVAD,
    resumeVAD,
    micError,
    clearMicError: () => setMicError(null),
    clearTranscript: () => actionsRef.current.clearTranscript()
  };
};