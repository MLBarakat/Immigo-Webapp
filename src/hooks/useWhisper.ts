import { useCallback, useEffect, useRef, useState } from 'react';
import { MicVAD } from '@ricky0123/vad-web';
import { logger } from '../logger';
import {
  AudioRingBuffer,
  MAX_AUDIO_BYTES,
  MAX_SEGMENT_SAMPLES,
  MIN_EXPORT_SAMPLES,
  TARGET_SAMPLE_RATE,
  type RingBufferExport,
} from '../utils/AudioRingBuffer';

type RuntimeTier = 1 | 2 | 3 | 4;
type WorkerTier = 'webgpu' | 'wasm-simd' | 'quantized-tiny';
type WorkerStatus = 'INIT_COMPLETED' | 'PROGRESS' | 'COMPLETED' | 'ERROR';

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface WorkerResponseMessage {
  status: WorkerStatus;
  correlationId: string;
  payload: {
    text?: string;
    latencyMs?: number;
    language?: string;
    error?: string;
    realTimeFactor?: number;
    progress?: number;
    tier?: WorkerTier;
  };
}

interface UseWhisperOptions {
  suppressCapture?: boolean;
  language?: string;
  authToken?: string;
}

export interface WhisperHook {
  interimTranscript: string;
  finalTranscript: string;
  isModelLoading: boolean;
  isVadReady: boolean;
  modelLoadingProgress: number;
  isTranscribing: boolean;
  startRecording: () => void;
  stopRecording: () => void;
}

const RTF_LIMIT = 0.5;
const MONITOR_INTERVAL_MS = 4_000;
const CLOUD_TIMEOUT_MS = 3_000;
const LEADER_CHANNEL = 'immigo-transcription-leader';

function createCorrelationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toWorkerTier(tier: RuntimeTier): WorkerTier {
  if (tier === 1) return 'webgpu';
  if (tier === 2) return 'wasm-simd';
  return 'quantized-tiny';
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function encodeAudioPayload(audio: Float32Array): ArrayBuffer {
  return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
}

export function buildCloudSocketStartMessage(correlationId: string, language?: string, sampleRate = TARGET_SAMPLE_RATE): Record<string, unknown> {
  return {
    type: 'control',
    action: 'start',
    correlationId,
    settings: { sampleRate, language: language ?? 'auto' },
  };
}

export const useWhisper = (options: UseWhisperOptions = {}): WhisperHook => {
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isVadReady, setIsVadReady] = useState(false);
  const [modelLoadingProgress, setModelLoadingProgress] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const ringBufferRef = useRef(new AudioRingBuffer());
  const finalTranscriptRef = useRef('');
  const nativeFinalRef = useRef('');
  const isRecordingRef = useRef(false);
  const speechActiveRef = useRef(false);
  const suppressCaptureRef = useRef(Boolean(options.suppressCapture));
  const activeCorrelationIdRef = useRef(createCorrelationId());
  const activeTierRef = useRef<RuntimeTier>(1);
  const consecutiveRtfBreachesRef = useRef(0);
  const pendingSegmentsRef = useRef(new Map<string, RingBufferExport>());
  const cloudSocketRef = useRef<WebSocket | null>(null);
  const leaderChannelRef = useRef<BroadcastChannel | null>(null);
  const tabIdRef = useRef(createCorrelationId());
  const isLeaderRef = useRef(false);

  const appendFinalTranscript = useCallback((text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return;

    const next = (finalTranscriptRef.current + ' ' + normalized).replace(/\s+/g, ' ').trim();
    finalTranscriptRef.current = next;
    setFinalTranscript(next);
    setInterimTranscript('');
    nativeFinalRef.current = '';
  }, []);

  const downscaleTier = useCallback((reason: string) => {
    const current = activeTierRef.current;
    if (current >= 4) return;
    activeTierRef.current = (current + 1) as RuntimeTier;
    logger.warn('Transcription runtime downscaled', { fromTier: current, toTier: activeTierRef.current, reason });
  }, []);

  const postWorkerInit = useCallback((tier = activeTierRef.current) => {
    const worker = workerRef.current;
    if (!worker || tier === 4) return;
    const correlationId = createCorrelationId();
    worker.postMessage({
      action: 'INIT',
      correlationId,
      payload: { config: { task: 'transcribe', language: options.language, tier: toWorkerTier(tier), useWebGPU: tier === 1 } },
    });
  }, [options.language]);

  const closeCloudSocket = useCallback(() => {
    cloudSocketRef.current?.close();
    cloudSocketRef.current = null;
  }, []);

  const connectCloudSocket = useCallback((correlationId: string): Promise<WebSocket> => {
    const configuredUrl = import.meta.env.VITE_TRANSCRIPTION_WS_URL as string | undefined;
    if (!configuredUrl) return Promise.reject(new Error('Cloud transcription endpoint is not configured.'));
    if (!configuredUrl.startsWith('wss://')) return Promise.reject(new Error('Cloud transcription endpoint must use wss://.'));

    const url = new URL(configuredUrl);
    if (options.authToken) url.searchParams.set('token', options.authToken);

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url.toString());
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error('Cloud transcription connection timed out.'));
      }, CLOUD_TIMEOUT_MS);

      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        window.clearTimeout(timeout);
        socket.send(JSON.stringify(buildCloudSocketStartMessage(correlationId, options.language, TARGET_SAMPLE_RATE)));
        cloudSocketRef.current = socket;
        resolve(socket);
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Cloud transcription socket error.'));
      };
    });
  }, [options.authToken, options.language]);

  const dispatchToWorker = useCallback((segment: RingBufferExport, tier: RuntimeTier) => {
    const worker = workerRef.current;
    if (!worker) return false;

    const correlationId = segment.correlationId ?? createCorrelationId();
    pendingSegmentsRef.current.set(correlationId, segment);
    worker.postMessage({
      action: 'TRANSCRIBE',
      correlationId,
      payload: {
        audio: segment.samples,
        config: { language: options.language, task: 'transcribe', tier: toWorkerTier(tier), useWebGPU: tier === 1 },
      },
    }, [segment.samples.buffer]);
    return true;
  }, [options.language]);

  const dispatchToCloud = useCallback(async (segment: RingBufferExport) => {
    const correlationId = segment.correlationId ?? createCorrelationId();
    pendingSegmentsRef.current.set(correlationId, segment);

    try {
      const socket = cloudSocketRef.current && cloudSocketRef.current.readyState === WebSocket.OPEN
        ? cloudSocketRef.current
        : await connectCloudSocket(correlationId);

      const timeoutId = window.setTimeout(() => {
        downscaleTier('cloud-timeout');
        dispatchToWorker(segment, 2);
      }, CLOUD_TIMEOUT_MS);

      socket.onmessage = (event: MessageEvent<string>) => {
        window.clearTimeout(timeoutId);
        try {
          const frame = JSON.parse(event.data) as { type?: string; text?: string; latencyMs?: number; correlationId?: string };
          if (frame.type === 'interim' && frame.text) setInterimTranscript(frame.text);
          if (frame.type === 'final') {
            pendingSegmentsRef.current.delete(frame.correlationId ?? correlationId);
            appendFinalTranscript(frame.text ?? nativeFinalRef.current);
          }
        } catch (error) {
          logger.warn('Invalid cloud transcription frame', { errorMessage: error instanceof Error ? error.message : String(error) });
        }
      };

      socket.send(encodeAudioPayload(segment.samples));
    } catch (error) {
      logger.warn('Cloud transcription failed; falling back to local WASM', { errorMessage: error instanceof Error ? error.message : String(error) });
      downscaleTier('cloud-failure');
      dispatchToWorker(segment, 2);
    }
  }, [appendFinalTranscript, connectCloudSocket, dispatchToWorker, downscaleTier]);

  const flushSegment = useCallback((reason: 'silence' | 'time-chop' | 'capacity' | 'manual') => {
    const ringBuffer = ringBufferRef.current;
    const correlationId = activeCorrelationIdRef.current;
    const segment = ringBuffer.getSamples(Math.min(ringBuffer.getAvailableSamples(), MAX_SEGMENT_SAMPLES), MIN_EXPORT_SAMPLES, correlationId);

    if (!segment) {
      logger.debug('Blocked empty transcription segment', { reason, availableSamples: ringBuffer.getAvailableSamples() });
      return;
    }

    ringBuffer.consume(segment.sampleCount);
    setIsTranscribing(true);

    if (activeTierRef.current === 4 && isLeaderRef.current) {
      void dispatchToCloud(segment);
      return;
    }

    if (!dispatchToWorker(segment, activeTierRef.current)) {
      appendFinalTranscript(nativeFinalRef.current);
      setIsTranscribing(false);
    }
  }, [appendFinalTranscript, dispatchToCloud, dispatchToWorker]);

  const startRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || suppressCaptureRef.current) return;
    try {
      recognition.start();
    } catch (error) {
      logger.debug('SpeechRecognition start ignored', { errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch (error) {
      logger.debug('SpeechRecognition stop ignored', { errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    suppressCaptureRef.current = Boolean(options.suppressCapture);
    if (suppressCaptureRef.current) {
      stopRecognition();
      return;
    }
    if (isRecordingRef.current) startRecognition();
  }, [options.suppressCapture, startRecognition, stopRecognition]);

  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(LEADER_CHANNEL) : null;
    leaderChannelRef.current = channel;
    isLeaderRef.current = true;
    channel?.postMessage({ type: 'leader-candidate', tabId: tabIdRef.current, timestamp: Date.now() });
    channel?.addEventListener('message', (event: MessageEvent<{ type?: string; tabId?: string }>) => {
      if (event.data?.type !== 'leader-candidate' || event.data.tabId === tabIdRef.current) return;
      isLeaderRef.current = tabIdRef.current > String(event.data.tabId);
    });
    return () => channel?.close();
  }, []);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });

    const handleMessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const { status, correlationId, payload } = event.data;
      if (status === 'PROGRESS') {
        setModelLoadingProgress(payload.progress ?? 0);
        return;
      }

      if (status === 'INIT_COMPLETED') {
        setIsModelLoading(false);
        setModelLoadingProgress(100);
        return;
      }

      if (status === 'COMPLETED') {
        const pending = pendingSegmentsRef.current.get(correlationId);
        pendingSegmentsRef.current.delete(correlationId);
        setIsTranscribing(false);

        if (typeof payload.realTimeFactor === 'number' && payload.realTimeFactor > RTF_LIMIT) {
          consecutiveRtfBreachesRef.current += 1;
          if (consecutiveRtfBreachesRef.current >= 2) downscaleTier('rtf-breach');
        } else {
          consecutiveRtfBreachesRef.current = 0;
        }

        appendFinalTranscript(payload.text || nativeFinalRef.current);
        if (pending?.wasTimeChopped && isRecordingRef.current) activeCorrelationIdRef.current = createCorrelationId();
        return;
      }

      if (status === 'ERROR') {
        const pending = pendingSegmentsRef.current.get(correlationId);
        pendingSegmentsRef.current.delete(correlationId);
        setIsTranscribing(false);
        logger.warn('Whisper worker error', { correlationId, errorMessage: payload.error });
        downscaleTier(payload.tier === 'webgpu' ? 'webgpu-context-lost' : 'worker-error');
        if (pending && activeTierRef.current < 4) dispatchToWorker(pending, activeTierRef.current);
      }
    };

    const handleError = (event: ErrorEvent) => {
      setIsModelLoading(false);
      setIsTranscribing(false);
      logger.error('Whisper worker runtime error', undefined, { errorMessage: event.message });
      downscaleTier('worker-runtime-error');
    };

    workerRef.current.addEventListener('message', handleMessage);
    workerRef.current.addEventListener('error', handleError);
    postWorkerInit(1);

    return () => {
      workerRef.current?.removeEventListener('message', handleMessage);
      workerRef.current?.removeEventListener('error', handleError);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [appendFinalTranscript, dispatchToWorker, downscaleTier, postWorkerInit]);

  useEffect(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      logger.warn('Browser SpeechRecognition API is unavailable; speculative transcript disabled.');
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = options.language ?? 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }

      if (finalText.trim()) nativeFinalRef.current = `${nativeFinalRef.current} ${finalText}`.trim();
      const speculative = `${finalTranscriptRef.current} ${nativeFinalRef.current} ${interim}`.replace(/\s+/g, ' ').trim();
      if (speculative) setInterimTranscript(speculative);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      logger.warn('SpeechRecognition error', { errorMessage: `${event.error}: ${event.message}` });
    };

    recognition.onend = () => {
      if (isRecordingRef.current && !suppressCaptureRef.current) startRecognition();
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [options.language, startRecognition]);

  useEffect(() => {
    let disposed = false;

    MicVAD.new({
      positiveSpeechThreshold: 0.7,
      negativeSpeechThreshold: 0.65,
      preSpeechPadFrames: 1,
      minSpeechFrames: 3,
      redemptionFrames: 8,
      onSpeechStart: () => {
        if (disposed || suppressCaptureRef.current) return;
        activeCorrelationIdRef.current = createCorrelationId();
        speechActiveRef.current = true;
        setIsTranscribing(true);
        startRecognition();
        logger.debug('Speech onset', { correlationId: activeCorrelationIdRef.current, onsetTs: performance.now() });
      },
      onSpeechEnd: () => {
        if (disposed) return;
        speechActiveRef.current = false;
        flushSegment('silence');
      },
      onVADMisfire: () => {
        speechActiveRef.current = false;
      },
      onFrameProcessed: (_probabilities: unknown, frame: Float32Array) => {
        if (disposed || suppressCaptureRef.current || !speechActiveRef.current) return;
        ringBufferRef.current.write(frame, TARGET_SAMPLE_RATE);

        if (ringBufferRef.current.shouldForceCapacityFlush()) flushSegment('capacity');
        else if (ringBufferRef.current.shouldForceTimeChop()) flushSegment('time-chop');
      },
    })
      .then((vad) => {
        if (disposed) {
          vad.destroy();
          return;
        }
        vadRef.current = vad;
        setIsVadReady(true);
      })
      .catch((error: unknown) => {
        logger.error('Failed to create VAD', undefined, { errorMessage: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      disposed = true;
      vadRef.current?.destroy();
      vadRef.current = null;
    };
  }, [flushSegment, startRecognition]);

  useEffect(() => {
    const monitor = window.setInterval(() => {
      if (pendingSegmentsRef.current.size > 1) downscaleTier('worker-backlog');
      if (ringBufferRef.current.getAvailableSamples() * Float32Array.BYTES_PER_ELEMENT >= MAX_AUDIO_BYTES) flushSegment('capacity');
    }, MONITOR_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopRecognition();
        vadRef.current?.pause();
        return;
      }
      if (isRecordingRef.current) {
        vadRef.current?.start();
        startRecognition();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      ringBufferRef.current.reset();
      workerRef.current?.postMessage({ action: 'RESET', correlationId: createCorrelationId(), payload: {} });
      if (isRecordingRef.current) startRecognition();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.clearInterval(monitor);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [downscaleTier, flushSegment, startRecognition, stopRecognition]);

  const startRecording = useCallback(() => {
    if (!vadRef.current || isRecordingRef.current) return;
    finalTranscriptRef.current = '';
    nativeFinalRef.current = '';
    ringBufferRef.current.reset();
    pendingSegmentsRef.current.clear();
    setFinalTranscript('');
    setInterimTranscript('');
    activeCorrelationIdRef.current = createCorrelationId();
    isRecordingRef.current = true;
    vadRef.current.start();
    startRecognition();
    logger.info('Transcription recording started', { correlationId: activeCorrelationIdRef.current });
  }, [startRecognition]);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    speechActiveRef.current = false;
    vadRef.current?.pause();
    stopRecognition();
    flushSegment('manual');
    closeCloudSocket();
    setIsTranscribing(false);
    logger.info('Transcription recording stopped');
  }, [closeCloudSocket, flushSegment, stopRecognition]);

  return {
    interimTranscript,
    finalTranscript,
    isModelLoading,
    isVadReady,
    modelLoadingProgress,
    isTranscribing,
    startRecording,
    stopRecording,
  };
};
