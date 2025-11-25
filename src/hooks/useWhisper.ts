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
    // Ref to manage the finalization logic and prevent race conditions
    const finalizingRef = useRef(false);

    const handleWorkerMessage = useCallback((event: MessageEvent) => {
        const data = event.data || {};
        const status = data.status;

        // Diagnostic log
        console.log("WORKER SAYS:", JSON.stringify(data));

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
            
            case 'update':
            case 'complete':
            case 'interim-result':
                if (typeof data.output === 'string') {
                    // If the finalizing flag is set, this is the last result.
                    if (finalizingRef.current) {
                        logger.info('Finalizing transcript:', { text: data.output });
                        setFinalTranscript({ text: data.output });
                        setInterimTranscript(''); // Clear the interim transcript
                        finalizingRef.current = false; // Reset the flag
                    } else {
                        // Otherwise, it's a regular interim update.
                        setInterimTranscript(data.output);
                    }
                }
                break;

            default:
                // Handle other messages like progress if needed
                break;
        }
    }, []); // No dependencies, relies on refs and setState

    // This callback is now only responsible for setting a flag.
    const onSpeechEnd = useCallback(() => {
        setIsTranscribing(false);
        // When VAD detects speech end, set a flag.
        // The next message from the worker will be treated as the final result.
        finalizingRef.current = true; 
        logger.debug('VAD: Speech ended. Awaiting final transcription.');
    }, []);

    useEffect(() => {
        worker.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
        worker.current.addEventListener('message', handleWorkerMessage);
        worker.current.postMessage({ action: 'load' });

        const vadOptions = {
            minSpeechFrames: 1,
            redemptionFrames: 24, 
            positiveSpeechThreshold: 0.8,
            negativeSpeechThreshold: 0.6,
            
            // When speech starts, clear previous transcripts.
            onSpeechStart: () => {
                logger.debug('VAD: Speech started');
                setInterimTranscript('');
                setFinalTranscript(null);
                finalizingRef.current = false;
                setIsTranscribing(true);
            },
            onSpeechEnd: onSpeechEnd,
            onVADMisfire: () => {
                logger.debug('VAD: Misfire (Short noise ignored)');
            },
            onSpeechData: (audio: Float32Array) => {
                if (worker.current) {
                    worker.current.postMessage({ action: 'transcribe', audio });
                }
            },
        };

        MicVAD.new(vadOptions)
            .then(newVad => {
                vad.current = newVad;
                setIsVadReady(true);
                logger.info('VAD initialized successfully.');
            })
            .catch(error => {
                logger.error("Failed to create VAD:", error);
            });

        return () => {
            worker.current?.terminate();
            vad.current?.destroy();
        };
    }, [handleWorkerMessage, onSpeechEnd]);

    const startRecording = useCallback(() => {
        if (vad.current) {
            try {
                vad.current.start();
                logger.info('VAD started. Listening...');
            } catch (err) {
                logger.error('Error starting VAD:', err);
            }
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (vad.current) {
            vad.current.pause();
            logger.info('VAD paused.');
            // Manually trigger speech end to finalize the transcript.
            onSpeechEnd(); 
        }
    }, [onSpeechEnd]);

    return { interimTranscript, finalTranscript, isModelLoading, isVadReady, modelLoadingProgress, isTranscribing, startRecording, stopRecording };
};