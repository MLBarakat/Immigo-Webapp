// src/hooks/useWhisper.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../logger';
import { MicVAD } from '@ricky0123/vad-web';

type VadOptions = {
    positiveSpeechThreshold?: number;
    negativeSpeechThreshold?: number;
    preSpeechPadFrames?: number;
    postSpeechPadFrames?: number;
};

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

export const useWhisper = (): WhisperHook => {
    const [interimTranscript, setInterimTranscript] = useState<string>('');
    const [finalTranscript, setFinalTranscript] = useState<string>('');
    const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
    const [isVadReady, setIsVadReady] = useState<boolean>(false);
    const [modelLoadingProgress, setModelLoadingProgress] = useState<number>(0);
    const [isTranscribing, setIsTranscribing] = useState<boolean>(false);

    const worker = useRef<Worker | null>(null);
    const vad = useRef<MicVAD | null>(null);
    const finalTranscriptRef = useRef<string>('');

    const isSpeechActiveRef = useRef<boolean>(false);
    const audioBufferRef = useRef<Float32Array[]>([]);
    const partialFlushTimerRef = useRef<number | null>(null);

    const handleWorkerMessage = useCallback((event: MessageEvent) => {
        const data = event.data || {};
        const status = data.status;

        logger.debug('Worker message', { status, inferenceId: data?.inferenceId, progress: data?.progress });

        switch (status) {
            case 'loading':
                setIsModelLoading(true);
                setModelLoadingProgress(data.progress ?? 0);
                break;
            case 'ready':
                setIsModelLoading(false);
                logger.info('Whisper model is ready.');
                break;
            case 'error':
                setIsModelLoading(false);
                logger.error('Whisper worker error:', undefined, { errorMessage: data?.error });
                break;

            case 'update':
                logger.info('Whisper interim update', { inferenceId: data?.inferenceId, text: data?.output });
                const incoming = String(data?.output || '').trim();
                if (!incoming) break;

                if (data?.inferenceId == null) {
                    if (typeof data?.clientSendTs === 'number') {
                        const roundTripMs = Date.now() - data.clientSendTs;
                        logger.info('Partial update RTT (ms)', { roundTripMs });
                    }

                    const sentenceRegex = /([^\.!?]*[\.!?]+)/g;
                    const matches = Array.from(incoming.matchAll(sentenceRegex)).map(m => m[0].trim()).filter(Boolean);
                    const remainder = incoming.replace(sentenceRegex, '').trim();

                    if (matches.length > 0) {
                        const committedText = matches.join(' ').trim();
                        if (committedText) {
                            const newFinal = (finalTranscriptRef.current + ' ' + committedText).trim();
                            finalTranscriptRef.current = newFinal;
                            setFinalTranscript(newFinal);
                            logger.info('Committed complete sentences from partial update', { committedText });
                        }
                    }

                    const interimText = remainder ? (finalTranscriptRef.current + ' ' + remainder).trim() : finalTranscriptRef.current;
                    setInterimTranscript(interimText);
                } else {
                    setInterimTranscript(finalTranscriptRef.current + ' ' + incoming);
                }
                break;

            case 'complete':
                logger.info('Whisper transcription complete', { inferenceId: data?.inferenceId, text: data?.output });
                const newTranscript = (finalTranscriptRef.current + ' ' + data.output).trim();
                finalTranscriptRef.current = newTranscript;
                setFinalTranscript(newTranscript);
                setInterimTranscript('');
                break;

            case 'inference-start':
                logger.info('Worker inference started', { inferenceId: data.inferenceId });
                break;

            case 'latency':
                logger.info('Transcription latency (ms)', { latencyMs: data.latencyMs, inferenceId: data.inferenceId });
                break;

            case 'cancelled':
                logger.info('Inference cancelled/ignored', { inferenceId: data.inferenceId });
                break;

            case 'speech-end-ack':
                logger.info('Worker acknowledged speech end', { inferenceId: data.inferenceId, timestamp: data.timestamp });
                break;

            case 'log':
                logger.info('Worker log', { message: data?.message });
                break;

            case 'pong':
                logger.info('Worker pong');
                break;

            default:
                if (typeof data.progress === 'number') {
                    setModelLoadingProgress(data.progress);
                }
                break;
        }
    }, []);

    const DEFAULT_PARTIAL_FLUSH_MS = 200;
    const DEFAULT_PARTIAL_WINDOW_S = 1.5;
    const DEFAULT_PARTIAL_MIN_MS = 200;

    try {
        if (!(window as any).__ASR) {
            (window as any).__ASR = {
                partialFlushMs: DEFAULT_PARTIAL_FLUSH_MS,
                partialWindowS: DEFAULT_PARTIAL_WINDOW_S,
                partialMinMs: DEFAULT_PARTIAL_MIN_MS,
                partialChunkS: 0.8,
                partialStrideS: 0.2,
            };
        }
    } catch (e) { }

    const getAsrParam = (key: string, fallback: number) => {
        try {
            const cfg = (window as any).__ASR;
            if (cfg && typeof cfg[key] === 'number') return cfg[key] as number;
        } catch (e) { }
        return fallback;
    };

    const flushPartial = useCallback((force = false) => {
        if (!vad.current?.listening && !force) return;

        const samples = audioBufferRef.current;
        if (!samples || samples.length === 0) return;

        let totalLen = 0;
        for (const s of samples) totalLen += s.length;
        const concat = new Float32Array(totalLen);
        let offset = 0;
        for (const s of samples) {
            concat.set(s, offset);
            offset += s.length;
        }

        const partialWindowS = getAsrParam('partialWindowS', DEFAULT_PARTIAL_WINDOW_S);
        const targetSamples = Math.floor(partialWindowS * 16000);
        const start = Math.max(0, concat.length - targetSamples);
        const partial = concat.slice(start);

        if (worker.current && partial.length > 0) {
            const clientSendTs = Date.now();
            try {
                worker.current.postMessage({ action: 'transcribe-partial', audio: partial, clientSendTs }, [partial.buffer]);
                logger.debug('Sent partial audio to worker', { partialLength: partial.length, clientSendTs });
            } catch (e) {
                logger.warn('Failed to transfer partial audio buffer, falling back to copy', { errorMessage: String(e) });
                worker.current.postMessage({ action: 'transcribe-partial', audio: partial, clientSendTs });
            }
        }

        audioBufferRef.current = [concat.slice(Math.max(0, concat.length - targetSamples))];
    }, []);

    const startPartialFlushTimer = useCallback(() => {
        if (partialFlushTimerRef.current !== null) return;
        const flushMs = getAsrParam('partialFlushMs', DEFAULT_PARTIAL_FLUSH_MS);
        partialFlushTimerRef.current = window.setInterval(() => {
            try { flushPartial(); } catch (e) { logger.warn('Partial flush timer error', { errorMessage: String(e) }); }
        }, flushMs);
    }, [flushPartial]);

    const stopPartialFlushTimer = useCallback(() => {
        if (partialFlushTimerRef.current !== null) {
            clearInterval(partialFlushTimerRef.current);
            partialFlushTimerRef.current = null;
        }
    }, []);

    const onSpeechEnd = useCallback((audio?: Float32Array) => {
        logger.debug('VAD: Speech ended.', { audioLength: audio?.length });
        setIsTranscribing(false);
        stopPartialFlushTimer();

        if (worker.current) {
            try {
                if (audio && audio.length > 0) {
                    logger.info('Sending final audio chunk to worker on speech end', { audioLength: audio.length });
                    try {
                        worker.current.postMessage({ action: 'transcribe', audio }, [audio.buffer]);
                    } catch (e) {
                        logger.warn('Failed to transfer final audio buffer, falling back to copy', { errorMessage: String(e) });
                        worker.current.postMessage({ action: 'transcribe', audio });
                    }

                    try {
                        worker.current.postMessage({ action: 'speech_end', timestamp: Date.now() });
                    } catch (e) {
                        logger.warn('Failed to send speech_end to worker', { errorMessage: String(e) });
                    }

                    audioBufferRef.current = [];
                } else {
                    setInterimTranscript(currentInterim => {
                        if (currentInterim.trim()) {
                            const newFinal = currentInterim.trim();
                            finalTranscriptRef.current = newFinal;
                            setFinalTranscript(newFinal);
                            logger.info('Finalizing transcript on speech end (no audio):', { text: newFinal });
                        }
                        return '';
                    });

                    try {
                        worker.current.postMessage({ action: 'speech_end', timestamp: Date.now() });
                    } catch (e) {
                        logger.warn('Failed to send speech_end to worker', { errorMessage: String(e) });
                    }
                }
            } catch (e) {
                logger.error('Error handling onSpeechEnd audio', undefined, { errorMessage: String(e) });
            }
        }

        if (vad.current?.listening) {
            vad.current.pause();
        }
    }, [stopPartialFlushTimer]);

    useEffect(() => {
        worker.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
        worker.current.addEventListener('message', handleWorkerMessage);
        worker.current.addEventListener('error', (e) => console.error('Whisper worker runtime error:', e));
        worker.current.addEventListener('messageerror', (e) => console.error('Whisper worker message error:', e));

        try {
            const envChunk = Number(import.meta.env.VITE_ASR_CHUNK_LENGTH_S ?? '');
            const envStride = Number(import.meta.env.VITE_ASR_STRIDE_LENGTH_S ?? '');
            const envPartialChunk = Number(import.meta.env.VITE_ASR_PARTIAL_CHUNK_S ?? '');
            const envPartialStride = Number(import.meta.env.VITE_ASR_PARTIAL_STRIDE_S ?? '');
            const runtimeASR = (window as any).__ASR ?? {};

            const cfg: Record<string, number> = {};
            if (Number.isFinite(envChunk)) cfg.chunk_length_s = envChunk;
            if (Number.isFinite(envStride)) cfg.stride_length_s = envStride;
            if (Number.isFinite(envPartialChunk)) cfg.partial_chunk_length_s = envPartialChunk;
            if (Number.isFinite(envPartialStride)) cfg.partial_stride_length_s = envPartialStride;

            if (typeof runtimeASR.partialChunkS === 'number') cfg.partial_chunk_length_s = runtimeASR.partialChunkS;
            if (typeof runtimeASR.partialStrideS === 'number') cfg.partial_stride_length_s = runtimeASR.partialStrideS;

            worker.current.postMessage({ action: 'load', config: cfg });
            if (Object.keys(cfg).length) logger.info('Sent ASR config to worker', cfg);
        } catch (e) {
            worker.current.postMessage({ action: 'load' });
        }

        try {
            worker.current.postMessage({ action: 'ping' });
        } catch (e) {
            console.warn('Failed to send ping to worker:', e);
        }

        const vadOptions: VadOptions & {
            minSpeechFrames: number;
            redemptionFrames: number;
            onSpeechStart: () => void;
            onSpeechEnd: (audio?: Float32Array) => void;
            onVADMisfire: () => void;
            onFrameProcessed: (probabilities: any, frame: Float32Array) => void;
        } = {
            minSpeechFrames: 3,
            redemptionFrames: 8,
            positiveSpeechThreshold: 0.7,
            negativeSpeechThreshold: 0.65,
            preSpeechPadFrames: 1,
            onSpeechStart: () => {
                logger.debug('VAD: Speech started');
                isSpeechActiveRef.current = true;
                setIsTranscribing(true);
                try { startPartialFlushTimer(); } catch (e) { logger.warn('Failed to start partial flush timer', { errorMessage: String(e) }); }
            },
            onSpeechEnd: (audio?: Float32Array) => {
                isSpeechActiveRef.current = false;
                onSpeechEnd(audio);
            },
            onVADMisfire: () => {
                logger.debug('VAD: Misfire (Short noise ignored)');
            },
            // Fix: Appended leading underscore to mark parameter unread, safely bypassing strict TS6133 rule checks
            onFrameProcessed: (_probabilities: any, frame: Float32Array) => {
                if (!isSpeechActiveRef.current) return;

                try {
                    audioBufferRef.current.push(frame);
                } catch (e) {
                    logger.warn('Failed to buffer audio for partial streaming', { errorMessage: String(e) });
                }

                try {
                    logger.info('VAD onSpeechData frame tracked', { audioLength: frame?.length });
                } catch (e) { }

                try {
                    const partialMinMs = getAsrParam('partialMinMs', DEFAULT_PARTIAL_MIN_MS);
                    let totalSamples = 0;
                    for (const s of audioBufferRef.current) totalSamples += s.length;
                    const totalMs = Math.floor(totalSamples / 16);
                    if (totalMs >= partialMinMs) {
                        flushPartial();
                    }
                } catch (e) { }
            },
        };

        MicVAD.new(vadOptions)
            .then(newVad => {
                vad.current = newVad;
                setIsVadReady(true);
                try {
                    if (vad.current?.listening) {
                        vad.current.pause();
                        logger.info('VAD initialized and paused; call startRecording() to begin listening.');
                    } else {
                        logger.info('VAD initialized (paused). Call startRecording() to begin listening.');
                    }
                } catch (e) {
                    logger.warn('Failed to pause VAD after initialization', { errorMessage: String(e) });
                }

                try {
                    (window as any).__vadInstance = vad.current;
                    (window as any).__whisperWorker = worker.current;
                    logger.debug('Exposed __vadInstance and __whisperWorker on window for debugging.');
                } catch (e) { }
            })
            .catch((error: unknown) => {
                logger.error("Failed to create VAD:", undefined, { errorMessage: error instanceof Error ? error.message : String(error) });
            });

        return () => {
            vad.current?.destroy();
            worker.current?.terminate();
        };
    }, [handleWorkerMessage, onSpeechEnd, flushPartial, startPartialFlushTimer]);

    const startRecording = useCallback(() => {
        if (!vad.current) {
            logger.warn('VAD not ready, cannot start recording.');
            return;
        }
        if (vad.current.listening) {
            logger.debug('VAD is already listening.');
            return;
        }
        finalTranscriptRef.current = '';
        setFinalTranscript('');
        setInterimTranscript('');
        isSpeechActiveRef.current = false;
        vad.current.start();
        logger.info('VAD started. Listening...');
    }, []);

    const stopRecording = useCallback(() => {
        if (!vad.current || !vad.current.listening) {
            return;
        }
        vad.current.pause();
        logger.info('VAD paused.');
        isSpeechActiveRef.current = false;

        const samples = audioBufferRef.current;
        let finalUtteranceAudio: Float32Array | undefined = undefined;

        if (samples && samples.length > 0) {
            let totalLen = 0;
            for (const s of samples) totalLen += s.length;
            finalUtteranceAudio = new Float32Array(totalLen);
            let offset = 0;
            for (const s of samples) {
                finalUtteranceAudio.set(s, offset);
                offset += s.length;
            }
        }

        onSpeechEnd(finalUtteranceAudio);
    }, [onSpeechEnd]);

    return { interimTranscript, finalTranscript, isModelLoading, isVadReady, modelLoadingProgress, isTranscribing, startRecording, stopRecording };
};