// src/hooks/useWhisper.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../logger';
import { MicVAD } from '@ricky0123/vad-web';

// Local type for VAD options since MicVADOptions is not exported from @ricky0123/vad-web
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
    // Use a ref to store the latest transcript to avoid stale closures in callbacks
    const finalTranscriptRef = useRef<string>(''); 

    const handleWorkerMessage = useCallback((event: MessageEvent) => {
        const data = event.data || {};
        const status = data.status;

        // Log a small summary instead of dumping the entire message payload to avoid excessive console noise
        logger.debug('Worker message', { status, inferenceId: data?.inferenceId, progress: data?.progress }); // Reduced verbosity; use structured logger

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

            // Worker is sending an interim update
            case 'update':
                // The output is a segment of the transcript. Differentiate partial (inferenceId == null) vs full inference updates.
                logger.info('Whisper interim update', { inferenceId: data?.inferenceId, text: data?.output });

                const incoming = String(data?.output || '').trim();
                if (!incoming) break;

                // Partial streaming updates (no inference id) — try to commit complete sentences early
                if (data?.inferenceId == null) {
                    // If the worker echoed back our clientSendTs, record time-to-first-interim for telemetry
                    if (typeof data?.clientSendTs === 'number') {
                        const roundTripMs = Date.now() - data.clientSendTs;
                        logger.info('Partial update RTT (ms)', { roundTripMs });
                    }

                    // Extract complete sentences ending with ., ?, or !
                    const sentenceRegex = /([^\.!?]*[\.!?]+)/g;
                    const matches = Array.from(incoming.matchAll(sentenceRegex)).map(m => m[0].trim()).filter(Boolean);
                    const remainder = incoming.replace(sentenceRegex, '').trim();

                    if (matches.length > 0) {
                        // Commit all complete sentences to final transcript immediately
                        const committedText = matches.join(' ').trim();
                        if (committedText) {
                            const newFinal = (finalTranscriptRef.current + ' ' + committedText).trim();
                            finalTranscriptRef.current = newFinal;
                            setFinalTranscript(newFinal);
                            logger.info('Committed complete sentences from partial update', { committedText });
                        }
                    }

                    // Set interim to final + remainder (if any)
                    const interimText = remainder ? (finalTranscriptRef.current + ' ' + remainder).trim() : finalTranscriptRef.current;
                    setInterimTranscript(interimText);
                } else {
                    // Full inference update for the active inference — append to interim so UI shows it
                    setInterimTranscript(finalTranscriptRef.current + ' ' + incoming);
                }
                break;

            // Worker has finished a full transcription chunk
            case 'complete':
                logger.info('Whisper transcription complete', { inferenceId: data?.inferenceId, text: data?.output });
                const newTranscript = (finalTranscriptRef.current + ' ' + data.output).trim();
                finalTranscriptRef.current = newTranscript;
                setFinalTranscript(newTranscript);
                setInterimTranscript(''); // Clear interim when a chunk is complete
                break;

            case 'inference-start':
                logger.info('Worker inference started', { inferenceId: data.inferenceId });
                break;

            case 'latency':
                // Small telemetry message with time in ms from speech end -> complete
                logger.info('Transcription latency (ms)', { latencyMs: data.latencyMs, inferenceId: data.inferenceId });
                break;

            case 'cancelled':
                logger.info('Inference cancelled/ignored', { inferenceId: data.inferenceId });
                break;

            case 'speech-end-ack':
                logger.info('Worker acknowledged speech end', { inferenceId: data.inferenceId, timestamp: data.timestamp });
                break;

            case 'log':
                // Generic log coming from the worker; display so we can monitor flow from the worker side
                logger.info('Worker log', { message: data?.message });
                break;

            case 'pong':
                logger.info('Worker pong');
                break;

            default:
                // Handle any other progress messages from the worker if needed
                if (typeof data.progress === 'number') {
                    setModelLoadingProgress(data.progress);
                }
                break;
        }
    }, []);

    // Accept the final audio chunk (if provided) from the VAD onSpeechEnd callback.
    // If audio is present, send it to the worker for transcription instead of locally finalizing the interim text
    // Buffer and partial flush logic to support live interim transcription while user is speaking
    const audioBufferRef = useRef<Float32Array[]>([]);
    const partialFlushTimerRef = useRef<number | null>(null);

    // Runtime ASR tuning params (exposed on window for dev tweaking)
    // Defaults tuned to reduce time-to-first-interim while keeping compute reasonable
    const DEFAULT_PARTIAL_FLUSH_MS = 200; // was 300
    const DEFAULT_PARTIAL_WINDOW_S = 1.5; // was 1.0
    const DEFAULT_PARTIAL_MIN_MS = 200; // flush immediately if at least 200ms buffered

    // Expose a simple tunable object in dev for quick experiments
    try {
        // @ts-ignore
        if (!(window as any).__ASR) {
            // @ts-ignore
            (window as any).__ASR = {
                partialFlushMs: DEFAULT_PARTIAL_FLUSH_MS,
                partialWindowS: DEFAULT_PARTIAL_WINDOW_S,
                partialMinMs: DEFAULT_PARTIAL_MIN_MS,
                partialChunkS: 0.8,
                partialStrideS: 0.2,
            };
        }
    } catch (e) {
        // ignore in non-browser test contexts
    }

    const getAsrParam = (key: string, fallback: number) => {
        try {
            // @ts-ignore
            const cfg = (window as any).__ASR;
            if (cfg && typeof cfg[key] === 'number') return cfg[key] as number;
        } catch (e) {
            // ignore
        }
        return fallback;
    };

    const flushPartial = useCallback((force = false) => {
        if (!vad.current?.listening && !force) return;

        // Concatenate buffered audio and take last N seconds defined by partialWindowS
        const samples = audioBufferRef.current;
        if (!samples || samples.length === 0) return;

        // Concatenate all chunks into one Float32Array
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

        // Send as partial transcribe message (non-final). Include a client timestamp so the worker's response
        // can be measured end-to-end for time-to-first-interim metrics.
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

        // Discard older buffered chunks to keep memory bounded (keep only recent)
        audioBufferRef.current = [concat.slice(Math.max(0, concat.length - targetSamples))];
    }, []);

    const startPartialFlushTimer = useCallback(() => {
        if (partialFlushTimerRef.current !== null) return;
        const flushMs = getAsrParam('partialFlushMs', DEFAULT_PARTIAL_FLUSH_MS);
        // Flush periodically while user is speaking for faster feedback
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

        // Stop periodic partial flushing
        stopPartialFlushTimer();

        if (worker.current) {
            try {
                if (audio && audio.length > 0) {
                    // Send the final audio chunk to the worker for transcription (transfer buffer)
                    logger.info('Sending final audio chunk to worker on speech end', { audioLength: audio.length });
                    try {
                        worker.current.postMessage({ action: 'transcribe', audio }, [audio.buffer]);
                    } catch (e) {
                        logger.warn('Failed to transfer final audio buffer, falling back to copy', { errorMessage: String(e) });
                        worker.current.postMessage({ action: 'transcribe', audio });
                    }

                    // After sending the audio, send a speech_end marker to allow the worker to calculate latency
                    try {
                        worker.current.postMessage({ action: 'speech_end', timestamp: Date.now() });
                    } catch (e) {
                        logger.warn('Failed to send speech_end to worker', { errorMessage: String(e) });
                    }

                    // Clear the buffer
                    audioBufferRef.current = [];

                    // Do not locally finalize the interim transcript; wait for worker 'complete' to update final text
                } else {
                    // No audio was provided by the VAD; finalize any lingering interim text locally
                    setInterimTranscript(currentInterim => {
                        if (currentInterim.trim()) {
                            const newFinal = currentInterim.trim();
                            finalTranscriptRef.current = newFinal;
                            setFinalTranscript(newFinal);
                            logger.info('Finalizing transcript on speech end (no audio):', { text: newFinal });
                        }
                        return '';
                    });

                    // Still notify the worker of speech end so any in-progress inference can measure latency
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

        // Pause the VAD after speech ends
        if (vad.current?.listening) {
            vad.current.pause();
        }

    }, [stopPartialFlushTimer]);

    useEffect(() => {
        worker.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
        worker.current.addEventListener('message', handleWorkerMessage);
        // Surface runtime worker errors to the console to help debugging
        worker.current.addEventListener('error', (e) => {
            console.error('Whisper worker runtime error:', e);
        });
        worker.current.addEventListener('messageerror', (e) => {
            console.error('Whisper worker message error:', e);
        });
        // Send load + optional ASR config (read from Vite env and runtime window __ASR)
        try {
            const envChunk = Number(import.meta.env.VITE_ASR_CHUNK_LENGTH_S ?? '');
            const envStride = Number(import.meta.env.VITE_ASR_STRIDE_LENGTH_S ?? '');
            const envPartialChunk = Number(import.meta.env.VITE_ASR_PARTIAL_CHUNK_S ?? '');
            const envPartialStride = Number(import.meta.env.VITE_ASR_PARTIAL_STRIDE_S ?? '');

            // Allow runtime overrides from window.__ASR for quick dev experimentation
            // @ts-ignore
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
            // Fallback to basic load if something goes wrong
            worker.current.postMessage({ action: 'load' });
        }

        // Ping the worker to confirm it's alive and responding
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
            onSpeechData: (audio: Float32Array) => void;
        } = {
            minSpeechFrames: 3,
            redemptionFrames: 8, 
            positiveSpeechThreshold: 0.7,
            negativeSpeechThreshold: 0.65,
            preSpeechPadFrames: 1,
            onSpeechStart: () => {
                logger.debug('VAD: Speech started');
                setIsTranscribing(true);
                // Start periodic flushes for partial streaming
                try { startPartialFlushTimer(); } catch (e) { logger.warn('Failed to start partial flush timer', { errorMessage: String(e) }); }
            },
            onSpeechEnd: onSpeechEnd, // (audio?: Float32Array) => void
            onVADMisfire: () => {
                logger.debug('VAD: Misfire (Short noise ignored)');
            },
            onSpeechData: (audio: Float32Array) => {
                // Buffer for partial streaming and also send direct small frames if desired
                try {
                    audioBufferRef.current.push(audio);
                } catch (e) {
                    logger.warn('Failed to buffer audio for partial streaming', { errorMessage: String(e) });
                }

                // Debug: confirm this callback is invoked; log only length to avoid noisy dumps
                try {
                    // Use INFO so we see it in non-dev builds; this is a critical signal that audio is being captured
                    logger.info('VAD onSpeechData', { audioLength: audio?.length });
                } catch (e) {
                    logger.warn('Error while logging onSpeechData info', { errorMessage: String(e) });
                }

                // If enough buffered audio has accumulated (> partialMinMs), trigger an immediate partial flush
                try {
                    const partialMinMs = getAsrParam('partialMinMs', DEFAULT_PARTIAL_MIN_MS);
                    // Compute total buffered samples
                    let totalSamples = 0;
                    for (const s of audioBufferRef.current) totalSamples += s.length;
                    const totalMs = Math.floor(totalSamples / 16); // samples / 16 = ms at 16kHz
                    if (totalMs >= partialMinMs) {
                        // Flush partial immediately so short bursts get a quick interim
                        flushPartial();
                    }
                } catch (e) {
                    // ignore
                }

                if (worker.current) {
                    // Log at INFO to ensure visibility in production logs
                    logger.info('Sending audio to worker', { audioLength: audio.length });
                    // Send audio to the worker for transcription
                    // Use a transferable object for performance
                    try {
                        worker.current.postMessage({ action: 'transcribe', audio }, [audio.buffer]);
                    } catch (e) {
                        logger.warn('Failed to transfer audio buffer, falling back to copy', { errorMessage: String(e) });
                        // Fallback if transferable is not supported (e.g., in some dev environments)
                        worker.current.postMessage({ action: 'transcribe', audio });
                    }
                }
            },
        };

        MicVAD.new(vadOptions)
            .then(newVad => {
                vad.current = newVad;
                setIsVadReady(true);
                // Important: Pause the VAD after initialization to avoid it auto-starting and capturing ambient noise
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

                // Dev helper: expose the VAD instance and worker on window for manual debugging
                try {
                    // @ts-ignore - dev debug helper
                    (window as any).__vadInstance = vad.current;
                    // @ts-ignore - dev debug helper
                    (window as any).__whisperWorker = worker.current;
                    logger.debug('Exposed __vadInstance and __whisperWorker on window for debugging.');
                } catch (e) {
                    // ignore
                }

                // Log VAD instance keys to help debug whether onSpeechData is present
                try {
                    logger.debug('VAD instance keys', { keys: Object.keys(vad.current || {}) });
                } catch (e) {
                    // ignore
                }
            })
            .catch((error: unknown) => {
                logger.error("Failed to create VAD:", undefined, { errorMessage: error instanceof Error ? error.message : String(error) });
            });

        return () => {
            vad.current?.destroy();
            worker.current?.terminate();
        };
    }, [handleWorkerMessage, onSpeechEnd]);

    const startRecording = useCallback(() => {
        if (!vad.current) {
            logger.warn('VAD not ready, cannot start recording.');
            return;
        }
        if (vad.current.listening) {
            logger.debug('VAD is already listening.');
            return;
        }
        finalTranscriptRef.current = ''; // Reset transcript on new recording
        setFinalTranscript('');
        setInterimTranscript('');
        vad.current.start();
        logger.info('VAD started. Listening...');
    }, []);

    const stopRecording = useCallback(() => {
        if (!vad.current || !vad.current.listening) {
            return;
        }
        vad.current.pause();
        logger.info('VAD paused.');
        onSpeechEnd(); // Trigger finalization logic
    }, [onSpeechEnd]);

    return { interimTranscript, finalTranscript, isModelLoading, isVadReady, modelLoadingProgress, isTranscribing, startRecording, stopRecording };
};