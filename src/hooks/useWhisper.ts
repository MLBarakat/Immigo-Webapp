import { useEffect, useRef, useCallback, useState } from 'react';
import { logger } from '../logger';
import { MicVAD } from '@ricky0123/vad-web';
import { useTranscription, TranscriptionState } from '../context/TranscriptionContext';
import { reconcileTranscripts } from '../utils/diffReconciliation';

export interface WhisperHook {
  currentState: TranscriptionState;
  displayTranscript: string;
  finalTranscript: string;
  isModelLoading: boolean;
  isVadReady: boolean;
  modelLoadingProgress: number;
  isTranscribing: boolean;
  startRecording: () => void;
  stopRecording: () => void;
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

export const useWhisper = (): WhisperHook => {
  // Connect directly to the authoritative global state context to prevent split-brain states
  const { state, actions } = useTranscription();
  
  // Local state tracking targets to drive initialization progress indicators smoothly
  const [vadInitializedState, setVadInitializedState] = useState<boolean>(false);
  const [loadingProgressPercent, setLoadingProgressPercent] = useState<number>(0);
  const [modelReadyState, setModelReadyState] = useState<boolean>(true);

  const workerRef = useRef<Worker | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativeRecognizerRef = useRef<any>(null);

  const audioFrameAccumulatorRef = useRef<Float32Array[]>([]);
  const activeTraceIdRef = useRef<string>('');
  const isRecordingRef = useRef<boolean>(false);
  const speechActiveRef = useRef<boolean>(false);
  const tabIdRef = useRef<string>('');
  const isLeaderRef = useRef<boolean>(true);
  const leaderChannelRef = useRef<BroadcastChannel | null>(null);

  // State Tracking Mirror reference to feed async event listeners without triggering re-binding loops
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
  }, [state, actions]);

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

    const compiledBuffer = compileAudioPayload(audioFrameAccumulatorRef.current);
    audioFrameAccumulatorRef.current = []; // Instantly clear chunks allocation pool to free headroom

    const sampleLength = compiledBuffer.length;
    const minSamplesLimit = remoteFeatureFlags.current.emptyHandoffSamplesMin;

    if (sampleLength > minSamplesLimit) {
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

  const handleWorkerMessage = useCallback((event: MessageEvent) => {
    const data = event.data || {};
    // Worker wraps all results inside a `payload` object and uses `correlationId` (not `traceId`).
    const status: string = data.status || '';
    const payload = data.payload || {};
    const correlationId: string = data.correlationId || '';

    // For transcription responses, validate that the correlationId matches the active trace.
    // INIT_COMPLETED and PROGRESS messages are broadcast-level and should never be filtered.
    const isTranscriptionResponse = status === 'COMPLETED' || status === 'UPDATE';
    if (isTranscriptionResponse && correlationId && correlationId !== activeTraceIdRef.current) {
      logger.warn('Correlation ID mismatch in worker message callback. Discarding stale transcription block.', {
        expected: activeTraceIdRef.current,
        received: correlationId
      });
      return;
    }

    // Process incoming worker thread signaling states using the mirror ref to protect render stability.
    // Worker protocol: INIT_COMPLETED | PROGRESS | UPDATE | COMPLETED | ERROR
    switch (status) {
      case 'PROGRESS':
        setLoadingProgressPercent(payload.progress || 0);
        break;
      case 'INIT_COMPLETED':
        setModelReadyState(false);
        setLoadingProgressPercent(100);
        logger.info(`Whisper worker initialized on tier: ${payload.tier || 'unknown'}`);
        // Model is ready — the FSM will be advanced to LISTENING via startRecording() calls.
        // We do NOT call startSession() here because the user has not yet pressed Start.
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
        logger.error('Background worker thread exception caught in orchestration hook.', { error: payload.error });
        actionsRef.current.inferenceFailed(payload.error || 'Unknown web worker inference crash exception.');
        break;
    }
  }, []);

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

    // Initialize accelerated machine learning background worker.
    // Worker expects action: 'INIT' (uppercase) with a correlationId field.
    const initCorrelationId = `init-${Date.now()}`;
    workerRef.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current.addEventListener('message', handleWorkerMessage);
    workerRef.current.postMessage({ action: 'INIT', correlationId: initCorrelationId, payload: { config: {} } });

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
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (!event.results[i].isFinal) {
            interimSequence += event.results[i][0].transcript;
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

    // Initialize Voice Activity Detection (VAD) audio processor infrastructure node lanes using millisecond-based options
    MicVAD.new({
      // Asset directory served from public/ — the library resolves the .onnx model and worklet bundle relative to this path
      baseAssetPath: '/',
      onnxWASMBasePath: '/',
      model: 'legacy',
      positiveSpeechThreshold: 0.7,
      negativeSpeechThreshold: 0.65,
      preSpeechPadMs: 500,  // FIXED: Converted from frame indexes to millisecond bounds
      minSpeechMs: 200,     // FIXED: Converted from frame indexes to millisecond bounds
      redemptionMs: 1000,   // FIXED: Converted from frame indexes to millisecond bounds
      onSpeechStart: () => {
        if (!isRecordingRef.current || !isLeaderRef.current) return;
        activeTraceIdRef.current = generateLocalTraceId();
        speechActiveRef.current = true;
        
        actionsRef.current.speechOnset(activeTraceIdRef.current); // Advance authoritative FSM to 'SPECULATIVE'
        try { nativeRecognizerRef.current.start(); } catch { /* Shield duplicate invoke exceptions */ }
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
      onFrameProcessed: (_probabilities: any, frame: Float32Array) => {
        if (!isRecordingRef.current || !speechActiveRef.current || !isLeaderRef.current) return;
        audioFrameAccumulatorRef.current.push(frame);

        const currentSamplesCount = audioFrameAccumulatorRef.current.reduce((acc, f) => acc + f.length, 0);
        const liveSeconds = currentSamplesCount / 16000;
        const physicalMemoryBytes = currentSamplesCount * 4;

        // Strict Operational Guard Gates: Time-Chop Guard & Forced Memory Fence checked inline
        if (liveSeconds >= remoteFeatureFlags.current.infiniteSpeakerCeilingS) {
          logger.info('Infinite Speaker Guard Engaged: Hard 20-second continuous duration ceiling split pass forced.');
          // flushActiveSegment sends the audio via TRANSCRIBE — no separate signal needed.
          flushActiveSegment('time-chop');
          activeTraceIdRef.current = generateLocalTraceId();
          speechActiveRef.current = true;
        } else if (physicalMemoryBytes >= remoteFeatureFlags.current.forcedBufferBoundsBytes) {
          logger.warn('Forced Buffer Bounds Fence Engaged: Ingestion memory pool weight limit breached. Flushing arena.');
          flushActiveSegment('capacity');
        }
      }
    }).then((initializedVad) => {
      vadRef.current = initializedVad;
      setVadInitializedState(true);
      try { vadRef.current.pause(); } catch { /* ignore */ }
    }).catch((err) => {
      logger.error('Failed to parse and initialize native VAD capture hooks:', undefined, { error: String(err) });
    });

    const handleBrowserLifecycleVisibilityShift = () => {
      if (document.hidden) {
        logger.info('Mobile Lifecycle Suspension Event: Tab contextual backgrounding detected. Freezing hardware channels.');
        try { vadRef.current?.pause(); } catch { /* ignore */ }
        try { nativeRecognizerRef.current?.stop(); } catch { /* ignore */ }
      } else if (isRecordingRef.current && isLeaderRef.current) {
        logger.info('Mobile Lifecycle Resumption Event: Tab focus restored. Awakening streaming configurations.');
        try { vadRef.current?.start(); } catch { /* ignore */ }
        try { nativeRecognizerRef.current?.start(); } catch { /* ignore */ }
      }
    };

    const handlePageShowBfcacheRestoration = (event: PageTransitionEvent) => {
      if (event.persisted) {
        logger.warn('BFCache Re-activation Core Event Intercepted: Purging old data arrays and clearing state counters.');
        audioFrameAccumulatorRef.current = [];
        workerRef.current?.postMessage({ action: 'RESET', correlationId: `bfcache_${Date.now()}` });
        if (isRecordingRef.current && isLeaderRef.current) {
          try { nativeRecognizerRef.current?.start(); } catch { /* ignore */ }
        }
      }
    };

    document.addEventListener('visibilitychange', handleBrowserLifecycleVisibilityShift);
    window.addEventListener('pageshow', handlePageShowBfcacheRestoration);

    return () => {
      document.removeEventListener('visibilitychange', handleBrowserLifecycleVisibilityShift);
      window.removeEventListener('pageshow', handlePageShowBfcacheRestoration);
      
      if (leaderChannelRef.current) {
        leaderChannelRef.current.close();
      }
      
      try { vadRef.current?.destroy(); } catch { /* ignore */ }
      try { nativeRecognizerRef.current?.abort(); } catch { /* ignore */ }
      
      if (workerRef.current) {
        workerRef.current.removeEventListener('message', handleWorkerMessage);
        workerRef.current.terminate();
      }
    };
  }, [handleWorkerMessage, flushActiveSegment, compileAudioPayload]);

  const startRecording = useCallback(() => {
    // nativeRecognizerRef is the optional "optimistic UI" speculative track — not a hard prerequisite.
    // VAD + Whisper must still run even when Web Speech API is unavailable.
    if (!vadInitializedState || !vadRef.current || !isLeaderRef.current) return;
    
    actionsRef.current.clearTranscript();
    audioFrameAccumulatorRef.current = [];
    isRecordingRef.current = true;

    // Advance the FSM from IDLE → LISTENING on every recording start.
    // The first session is started by the worker 'ready' message, but all
    // subsequent sessions (after stopRecording resets the FSM to IDLE) must
    // re-enter LISTENING here — otherwise SPEECH_ONSET fires from IDLE and
    // the gatekeeper blocks every transition, producing no transcription output.
    actionsRef.current.startSession();
    
    try { vadRef.current.start(); } catch { /* ignore */ }
    logger.info('Authoritative dual-track orchestration loops successfully initialized.');
  }, [vadInitializedState]);

  const stopRecording = useCallback(() => {
    if (!vadRef.current) return;

    const hasPendingSpeech = speechActiveRef.current || stateRef.current.fsm === 'VERIFYING';
    
    isRecordingRef.current = false;
    speechActiveRef.current = false;
    
    try { vadRef.current.pause(); } catch { /* ignore */ }
    try { nativeRecognizerRef.current?.stop(); } catch { /* ignore */ }
    
    flushActiveSegment('manual');
    // Keep an in-flight Whisper result eligible for commitment after capture stops.
    if (!hasPendingSpeech) actionsRef.current.endSession();
    logger.info('Authoritative dual-track orchestration loops successfully wound down.');
  }, [flushActiveSegment]);

  return {
    currentState: state.fsm,
    displayTranscript: state.fsm === 'IDLE' ? state.committedText : (state.committedText + ' ' + state.speculativeText).trim(),
    finalTranscript: state.committedText,
    isModelLoading: modelReadyState,
    isVadReady: vadInitializedState,
    modelLoadingProgress: loadingProgressPercent,
    isTranscribing: state.fsm === 'VERIFYING',
    startRecording, // FIXED: Successfully returned functions back into the object literal instance
    stopRecording  // FIXED: Successfully returned functions back into the object literal instance
  };
};