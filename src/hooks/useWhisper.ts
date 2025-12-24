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

        console.log("WORKER SAYS:", JSON.stringify(data)); // Keep for debugging

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
                logger.error('Whisper worker error:', data.error);
                break;

            // Worker is sending an interim update
            case 'update':
                // The output is a segment of the transcript. We append it.
                setInterimTranscript(finalTranscriptRef.current + ' ' + data.output);
                break;

            // Worker has finished a full transcription chunk
            case 'complete':
                const newTranscript = (finalTranscriptRef.current + ' ' + data.output).trim();
                finalTranscriptRef.current = newTranscript;
                setFinalTranscript(newTranscript);
                setInterimTranscript(''); // Clear interim when a chunk is complete
                break;

            default:
                // Handle any other progress messages from the worker if needed
                if (typeof data.progress === 'number') {
                    setModelLoadingProgress(data.progress);
                }
                break;
        }
    }, []);

    const onSpeechEnd = useCallback(() => {
        logger.debug('VAD: Speech ended.');
        setIsTranscribing(false);

        // Finalize any lingering interim text when speech stops
        setInterimTranscript(currentInterim => {
            if (currentInterim.trim()) {
                const newFinal = currentInterim.trim();
                finalTranscriptRef.current = newFinal;
                setFinalTranscript(newFinal);
                logger.info('Finalizing transcript on speech end:', { text: newFinal });
            }
            return ''; // Clear interim text
        });
        
        // Optional: Pause the VAD. `stopRecording` already does this.
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
        worker.current.postMessage({ action: 'load' });
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
            onSpeechEnd: () => void;
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
            onSpeechEnd: onSpeechEnd,
            onVADMisfire: () => {
                logger.debug('VAD: Misfire (Short noise ignored)');
            },
            onSpeechData: (audio: Float32Array) => {
                // Debug: confirm this callback is invoked and inspect the audio
                try {
                    console.debug('VAD onSpeechData invoked, audio length:', audio?.length);
                    if (audio && audio.length > 0) {
                        // Print a small sample to help ensure non-zero data
                        console.debug('audio sample:', audio.slice(0, Math.min(10, audio.length)));
                    }
                } catch (e) {
                    console.warn('Error while logging onSpeechData debug info:', e);
                }

                if (worker.current) {
                    console.debug('Sending audio to worker (length):', audio.length);
                    // Send audio to the worker for transcription
                    // Use a transferable object for performance
                    try {
                        worker.current.postMessage({ action: 'transcribe', audio }, [audio.buffer]);
                    } catch (e) {
                        console.warn('Failed to transfer audio buffer, falling back to copy:', e);
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
                logger.info('VAD initialized successfully.');
                // Dev helper: expose the VAD instance and worker on window for manual debugging
                try {
                    // @ts-ignore - dev debug helper
                    (window as any).__vadInstance = vad.current;
                    // @ts-ignore - dev debug helper
                    (window as any).__whisperWorker = worker.current;
                    console.debug('Exposed __vadInstance and __whisperWorker on window for debugging.');
                } catch (e) {
                    // ignore
                }

                // Log VAD instance keys to help debug whether onSpeechData is present
                try {
                    console.debug('VAD instance keys:', Object.keys(vad.current || {}));
                } catch (e) {
                    // ignore
                }
            })
            .catch(error => {
                logger.error("Failed to create VAD:", error);
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