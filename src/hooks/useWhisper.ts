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
        const { status, output } = event.data;
        switch (status) {
            case 'loading':
                setIsModelLoading(true);
                setModelLoadingProgress(typeof event.data.progress === 'number' ? event.data.progress : 0);
                break;
            case 'ready':
                setIsModelLoading(false);
                logger.info('Whisper model is ready.');
                break;
            case 'interim-result':
                setInterimTranscript(output);
                break;
            case 'error':
                setIsModelLoading(false);
                logger.error('Whisper worker error:', event.data.message);
                break;
            default:
                if (typeof event.data.progress === 'number') { // Only update progress if it's a number
                    setModelLoadingProgress(event.data.progress);
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
                logger.debug('VAD: onSpeechData received audio chunk.', { length: audio.length });
                if (worker.current) {
                    worker.current.postMessage({ action: 'transcribe', audio });
                }
            },
            onFrameProcessed: (probabilities: { speech: number; notSpeech: number }, frame: Float32Array) => {
                // Log VAD probabilities to see if any audio is being processed
                // probabilities.isSpeech is true if speech is detected in the frame
                console.log('VAD: Frame processed. Speech probability:', probabilities.speech, 'Is speech:', probabilities.isSpeech);
            },
            baseAssetPath: '/assets/', // Look for VAD assets in the /assets/ subdirectory
            onnxWASMBasePath: '/assets/', // Look for ONNX Runtime WASM/MJS files in the /assets/ subdirectory
        };

        MicVAD.new(vadOptions).then(newVad => {
            vad.current = newVad;
            setIsVadReady(true);
            logger.info('VAD initialized successfully. isVadReady set to true.');
        }).catch(error => {
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
