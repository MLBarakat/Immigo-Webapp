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
    isTranscribing: boolean; 
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

        if (status === 'asset-check') {
            logger.info('Worker asset check:', data.assets);
            return;
        }

        if (status === 'log') {
            logger.debug('Worker log:', data.message || data.result || data);
            return;
        }

        if (status === 'error') {
            setIsModelLoading(false);
            const err = data.error || { message: data.message };
            logger.error('Whisper worker error:', err.message || err);
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
                if (typeof data.progress === 'number') {
                    setModelLoadingProgress(data.progress);
                }
                break;
        }
    }, []);

    const onSpeechEnd = useCallback(() => {
        setIsTranscribing(false);
        setInterimTranscript(currentInterim => {
            if (currentInterim) {
                logger.info('Finalizing transcript:', { text: currentInterim });
                setFinalTranscript({ text: currentInterim });
            }
            return ''; 
        });
    }, []);

    useEffect(() => {
        worker.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
        worker.current.addEventListener('message', handleWorkerMessage);
        worker.current.postMessage({ action: 'load' });

        const vadOptions = {
            // 1. Lower the minimum speech duration (Default is often 3 frames / ~300ms)
            // Setting to 1 frame allows even very short utterances like "Hi".
            minSpeechFrames: 1, 

            // 2. Increase the "patience" before cutting off (Default is often ~20-30 frames)
            // This prevents the VAD from cutting you off if you pause for a second while thinking.
            redemptionFrames: 24, // ~2.5 seconds of silence required to end a sentence

            // 3. Sensitivity Thresholds (0.0 to 1.0)
            // Lower = More Sensitive (picks up whispers). Higher = Less Sensitive (needs loud voice).
            positiveSpeechThreshold: 0.8, // Start speaking when confidence > 80%
            negativeSpeechThreshold: 0.6, // Stop speaking when confidence < 60%

            onSpeechStart: () => {
                logger.debug('VAD: Speech started');
                setIsTranscribing(true);
            },
            onSpeechEnd: onSpeechEnd,
            onVADMisfire: () => {
                // Optional: Log this to see if we are still ignoring things we shouldn't
                logger.debug('VAD: Misfire (Short noise ignored)');
            },
            onSpeechData: (audio: Float32Array) => {
                if (worker.current) {
                    try {
                        worker.current.postMessage({ action: 'transcribe', audio }, [audio.buffer]);
                    } catch (e) {
                        worker.current.postMessage({ action: 'transcribe', audio });
                    }
                }
            },
        };

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

    // FIX: Memoize startRecording to prevent re-creation on every render
    const startRecording = useCallback(() => {
        if (vad.current) {
            try {
                const res = vad.current.start();
                logger.debug('VAD.start() result:', res);
                logger.info('VAD started. Listening...');
            } catch (err) {
                logger.error('Error starting VAD:', err);
            }
        } else {
            logger.warn('VAD not initialized, cannot start recording.');
        }
    }, []); // Empty dependency array as vad is a Ref

    // FIX: Memoize stopRecording to prevent re-creation on every render
    const stopRecording = useCallback(() => {
        if (vad.current) {
            vad.current.pause();
            logger.info('VAD paused.');
            onSpeechEnd(); 
        }
    }, [onSpeechEnd]); // Dependent on onSpeechEnd

    return { interimTranscript, finalTranscript, isModelLoading, isVadReady, modelLoadingProgress, isTranscribing, startRecording, stopRecording };
};