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
  startRecording: () => void;
  stopRecording: () => void;
  clearTranscript: () => void;
}

interface WhisperOptions {
  readonly onSpeechStart?: () => void;
}

const LEADER_CHANNEL_NAME = 'immigo-transcription-leader';

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
  const initGenerationRef = useRef(0);

  // Local readiness flags for the VAD and Whisper model worker.
  // idle = nothing loaded yet (no mic, no WASM). First Start tap initializes.
  const [initStatus, setInitStatus] = useState<InitStatus>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [vadInitializedState, setVadInitializedState] = useState<boolean>(false);
  const [modelReadyState, setModelReadyState] = useState<boolean>(false);
  const initStatusRef = useRef<InitStatus>('idle');
  const initPromiseRef = useRef<Promise<boolean> | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const workerUnavailableRef = useRef(false);
  const vadRef = useRef<MicVAD | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativeRecognizerRef = useRef<any>(null);

  const audioFrameAccumulatorRef = useRef<Float32Array[]>([]);
  const segmentSampleCountRef = useRef(0);
  const segmentEnergySumRef = useRef(0);
  const segmentSpeechProbabilitySumRef = useRef(0);
  const segmentFrameCountRef = useRef(0);
  const activeTraceIdRef = useRef<string>('');
  const isRecordingRef = useRef<boolean>(false);
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
        workerUnavailableRef.current = false;
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
   * Lazy, shared, retryable init. Model download + compile starts on mount
   * (background preload, no mic: startOnLoad:false so getUserMedia is NOT
   * called). Mic is requested later inside vad.start() on the Start tap
   * gesture. Concurrent callers share one promise.
   */
  const ensureInitialized = useCallback((): Promise<boolean> => {
    if (initStatusRef.current === 'ready' && vadRef.current && workerRef.current) {
      return Promise.resolve(true);
    }
    if (initStatusRef.current === 'initializing' && initPromiseRef.current) {
      return initPromiseRef.current;
    }
    const generation = ++initGenerationRef.current;
    setInitStatusBoth('initializing');
    setInitError(null);
    // Worker shows busy until INIT_COMPLETED arrives.
    setModelReadyState(true);

    const promise = (async (): Promise<boolean> => {
      try {
        // Worker (tiny-only on mobile; see selectUpgradeTier).
        if (!workerRef.current) {
          const worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
          worker.addEventListener('message', handleWorkerMessage);
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
          if (unmountedRef.current || generation !== initGenerationRef.current) return false;
          worker.postMessage({
            action: 'INIT',
            correlationId: `init-${Date.now()}`,
            payload: { config: { useWebGPU: supportsWebGpu } },
          });
        }

        // VAD model load only (no getUserMedia until vad.start()).
        if (!vadRef.current) {
          console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId, tabId: tabIdRef.current, phase: 'init-start' })}`);
          const initializedVad = await MicVAD.new({
            baseAssetPath: '/',
            onnxWASMBasePath: '/assets/js/',
            model: 'legacy',
            startOnLoad: false,
            getStream: async () => {
              const stream = await createMicrophoneStream({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              });
              microphoneStreamRef.current = stream;
              return stream;
            },
            pauseStream: async (stream) => {
              stream.getAudioTracks().forEach((track) => { track.enabled = false; });
            },
            resumeStream: async (stream) => {
              stream.getAudioTracks().forEach((track) => { track.enabled = true; });
              return stream;
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
          if (unmountedRef.current || generation !== initGenerationRef.current) {
            try { initializedVad.destroy(); } catch { /* ignore */ }
            return false;
          }
          vadRef.current = initializedVad;
          try { vadRef.current.pause(); } catch { /* ignore */ }
          console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId, tabId: tabIdRef.current, phase: 'init-ready' })}`);
        }

        setVadInitializedState(true);
        setInitStatusBoth('ready');
        return true;
      } catch (err) {
        if (generation !== initGenerationRef.current) return false;
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Voice init failed (retryable on next tap).', undefined, { error: message });
        setInitError(message);
        setInitStatusBoth('error');
        setModelReadyState(false);
        // Allow retry: drop failed worker so next tap rebuilds.
        try { workerRef.current?.terminate(); } catch { /* ignore */ }
        workerRef.current = null;
        vadRef.current = null;
        setVadInitializedState(false);
        return false;
      } finally {
        initPromiseRef.current = null;
      }
    })();
    initPromiseRef.current = promise;
    return promise;
  }, [handleWorkerMessage, flushActiveSegment, setInitStatusBoth, instanceId]);

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

    // Heavy ML init (Worker + VAD model) is lazy via ensureInitialized(),
    // called from the Start-tap gesture. Nothing loads on page mount.

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

    // VAD + Worker are created lazily in ensureInitialized() on Start tap.

    const isStreamUsable = () => {
      const s = microphoneStreamRef.current;
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
        if (microphoneStreamRef.current && !isStreamUsable()) {
          logger.warn('Mic stream ended during suspension; awaiting next Start tap to recover.');
          return;
        }
        if (ctx && ctx.state === 'closed') {
          logger.warn('AudioContext closed during suspension; awaiting next Start tap to recover.');
          return;
        }
        logger.info('Mobile Lifecycle Resumption Event: Tab focus restored. Awakening streaming configurations.');
        try { vadRef.current?.start(); } catch { /* ignore */ }
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

    document.addEventListener('visibilitychange', handleBrowserLifecycleVisibilityShift);
    window.addEventListener('pageshow', handlePageShowBfcacheRestoration);
    const mountedInstanceId = instanceId;
    const mountedTabId = tabIdRef.current;
    console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId: mountedInstanceId, tabId: mountedTabId, phase: 'mount' })}`);

    // Background preload (confirmed behavior): download + compile Tiny +
    // VAD model on page load with NO mic request (startOnLoad:false).
    // Mic fires only inside the Start-tap gesture via vad.start().
    // Text chat stays usable while this runs; voice tap is blocked meanwhile.
    void ensureInitialized().catch(() => undefined);

    return () => {
      console.info(`[VAD-MOUNT] ${JSON.stringify({ instanceId: mountedInstanceId, tabId: mountedTabId, phase: 'unmount' })}`);
      unmountedRef.current = true;
      initGenerationRef.current += 1;
      document.removeEventListener('visibilitychange', handleBrowserLifecycleVisibilityShift);
      window.removeEventListener('pageshow', handlePageShowBfcacheRestoration);

      const leaderChannel = leaderChannelRef.current;
      if (leaderChannel) {
        leaderChannel.close();
        leaderChannelRef.current = null;
      }

      // Full cleanup only on actual unmount — never on backgrounding.
      try { vadRef.current?.destroy(); } catch { /* ignore */ }
      vadRef.current = null;
      const micStream = microphoneStreamRef.current;
      micStream?.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
      try { nativeRecognizerRef.current?.abort(); } catch { /* ignore */ }

      const worker = workerRef.current;
      if (worker) {
        worker.removeEventListener('message', handleWorkerMessage);
        worker.terminate();
        workerRef.current = null;
      }
      setVadInitializedState(false);
      setModelReadyState(false);
      setInitStatusBoth('idle');
    };
  }, [handleWorkerMessage, setInitStatusBoth, instanceId, ensureInitialized]);

  const beginCapture = useCallback(() => {
    actionsRef.current.clearTranscript();
    audioFrameAccumulatorRef.current = [];
    isRecordingRef.current = true;

    // Advance the FSM from IDLE → LISTENING on every recording start.
    actionsRef.current.startSession();

    // Mic is requested here, inside the gesture chain, via getStream.
    try { vadRef.current?.start(); } catch { /* ignore */ }
    logger.info('Authoritative dual-track orchestration loops successfully initialized.');
  }, []);

  const startRecordingRef = useRef<() => void>(() => undefined);
  const startRecording = useCallback(() => {
    if (!isLeaderRef.current) return;
    // Background preload runs on mount. A tap during preload is blocked by
    // the UI (pulsating); guard here ignores it. A tap after an init error
    // retries once via the shared promise.
    if (initStatusRef.current !== 'ready' || !vadRef.current) {
      if (initStatusRef.current === 'error') {
        const runner = startRecordingRef.current;
        void ensureInitialized().then((ok) => {
          if (ok && !unmountedRef.current) runner();
        });
      } else {
        logger.info('Voice init still in background; tap ignored until ready.');
      }
      return;
    }

    beginCapture();
  }, [ensureInitialized, beginCapture]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  const stopRecording = useCallback(() => {
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
    clearTranscript: () => actionsRef.current.clearTranscript()
  };
};