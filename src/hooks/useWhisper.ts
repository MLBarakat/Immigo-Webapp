// src/hooks/useWhisper.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../logger';
import { MicVAD } from '@ricky0123/vad-web';

export interface WhisperHook {
    interimTranscript: string;
    finalTranscript: { text: string } | null;
    isModelLoading: boolean;
    isVadReady: boolean;
    modelLoadingProgress: number;
    isTranscribing: boolean; // This now means "is user speaking"
    startRecording: () => void;
    stopRecording: () => void;
}

export const useWhisper = (): WhisperHook => {
    const [interimTranscript, setInterimTranscript] = useState<string>('');
    const [finalTranscript, setFinalTranscript] = useState<{ text: string } | null>(null);
    const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
    const [isVadReady, setIsVadReady] = useState<boolean>(false);
    const [modelLoadingProgress, setModelLoadingProgress] = useState<number>(0);
    const [isTranscribing, setIsTranscribing] = useState<boolean>(false);

    const worker = useRef<Worker | null>(null);
    const vad = useRef<MicVAD | null>(null);

    const handleWorkerMessage = useCallback((event: MessageEvent) => {
        const data = event.data || {};
        const status = data.status;

        // Asset probe results
        if (status === 'asset-check') {
            logger.info('Worker asset check:', data.assets);
            return;
        }

        if (status === 'log') {
            // Structured log from worker
            logger.debug('Worker log:', data.message || data.result || data);
            return;
        }

        if (status === 'error') {
            setIsModelLoading(false);
            const err = data.error || { message: data.message };
            // Log full error with stack if available
            logger.error('Whisper worker error:', err.message || err);
            if (err.stack) {
                logger.error('Whisper worker stack:', err.stack);
            }
            return;
        }

        switch (status) {
            case 'loading':
                setIsModelLoading(true);
                setModelLoadingProgress(typeof data.progress === 'number' ? data.progress : 0);
                break;
            case 'ready':
                setIsModelLoading(false);
                logger.info('Whisper model is ready.');
                break;
            case 'interim-result':
                setInterimTranscript(data.output);
                break;
            default:
                if (typeof data.progress === 'number') { // Only update progress if it's a number
                    setModelLoadingProgress(data.progress);
                }
                break;
        }
    }, []);

    const onSpeechEnd = useCallback(() => {
        setIsTranscribing(false);
        // Use a functional state update to get the latest interim transcript
        setInterimTranscript(currentInterim => {
            if (currentInterim) {
                logger.info('Finalizing transcript:', { text: currentInterim });
                setFinalTranscript({ text: currentInterim });
            }
            return ''; // Clear interim transcript
        });
    }, []);

    useEffect(() => {
        worker.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
        worker.current.addEventListener('message', handleWorkerMessage);
        worker.current.postMessage({ action: 'load' });

        const vadOptions = {
            onSpeechStart: () => {
                setIsTranscribing(true);
            },
            onSpeechEnd: onSpeechEnd,
            onSpeechData: (audio: Float32Array) => {
                if (worker.current) {
                    try {
                        // Transfer the underlying buffer to the worker to avoid copying large audio chunks
                        worker.current.postMessage({ action: 'transcribe', audio }, [audio.buffer]);
                    } catch (e) {
                        // If transfer fails (some browsers/environments), fallback to normal postMessage
                        worker.current.postMessage({ action: 'transcribe', audio });
                    }
                }
            },
        };

        // Initialize VAD once
        MicVAD.new(vadOptions)
            .then(newVad => {
                vad.current = newVad;
                setIsVadReady(true);
                logger.info('VAD initialized successfully. isVadReady set to true.');
            })
            .catch(error => {
                logger.error("Failed to create VAD:", error);
            });

        return () => {
            worker.current?.terminate();
            vad.current?.destroy();
        };
    }, [handleWorkerMessage, onSpeechEnd]);

    const startRecording = () => {
        if (vad.current) {
            vad.current.start();
            logger.info('VAD started. Listening...');
        } else {
            logger.warn('VAD not initialized, cannot start recording.');
        }
    };

    const stopRecording = () => {
        if (vad.current) {
            vad.current.pause();
            logger.info('VAD paused.');
            onSpeechEnd(); // Finalize any pending speech
        }
    };

    return { interimTranscript, finalTranscript, isModelLoading, isVadReady, modelLoadingProgress, isTranscribing, startRecording, stopRecording };
};
