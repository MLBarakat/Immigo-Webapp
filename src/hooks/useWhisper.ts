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
                // The output is a segment of the transcript. We append it.
                logger.info('Whisper interim update', { inferenceId: data?.inferenceId, text: data?.output });
                setInterimTranscript(finalTranscriptRef.current + ' ' + data.output);
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
    const onSpeechEnd = useCallback((audio?: Float32Array) => {
        logger.debug('VAD: Speech ended.', { audioLength: audio?.length });
        setIsTranscribing(false);

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

    }, []);

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
        // Send load + optional ASR config (read from Vite env): VITE_ASR_CHUNK_LENGTH_S & VITE_ASR_STRIDE_LENGTH_S
        try {
            const envChunk = Number(import.meta.env.VITE_ASR_CHUNK_LENGTH_S ?? '');
            const envStride = Number(import.meta.env.VITE_ASR_STRIDE_LENGTH_S ?? '');
            const cfg: Record<string, number> = {};
            if (Number.isFinite(envChunk)) cfg.chunk_length_s = envChunk;
            if (Number.isFinite(envStride)) cfg.stride_length_s = envStride;
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
            },
            onSpeechEnd: onSpeechEnd, // (audio?: Float32Array) => void
            onVADMisfire: () => {
                logger.debug('VAD: Misfire (Short noise ignored)');
            },
            onSpeechData: (audio: Float32Array) => {
                // Debug: confirm this callback is invoked; log only length to avoid noisy dumps
                try {
                    // Use INFO so we see it in non-dev builds; this is a critical signal that audio is being captured
                    logger.info('VAD onSpeechData', { audioLength: audio?.length });
                } catch (e) {
                    logger.warn('Error while logging onSpeechData info', { errorMessage: String(e) });
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