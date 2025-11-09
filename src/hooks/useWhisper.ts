// src/hooks/useWhisper.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../logger';
import { MicVAD } from '@ricky0123/vad-web';

export interface WhisperHook {
    interimTranscript: string;
    finalTranscript: { text: string } | null;
    isModelLoading: boolean;
    isVadReady: boolean; // New state
    modelLoadingProgress: number;
    isTranscribing: boolean;
    startRecording: () => void;
    stopRecording: () => void;
}

export const useWhisper = (): WhisperHook => {
    const [interimTranscript, setInterimTranscript] = useState<string>('');
    const [finalTranscript, setFinalTranscript] = useState<{ text: string } | null>(null);
    const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
    const [isVadReady, setIsVadReady] = useState<boolean>(false); // New state
    const [modelLoadingProgress, setModelLoadingProgress] = useState<number>(0);
    const [isTranscribing, setIsTranscribing] = useState<boolean>(false);

    const worker = useRef<Worker | null>(null);
    const vad = useRef<MicVAD | null>(null);
    const audioBuffer = useRef<Float32Array[]>([]);

    const handleWorkerMessage = useCallback((event: MessageEvent) => {
        const { status, output } = event.data;
        switch (status) {
            case 'loading':
                setIsModelLoading(true);
                setModelLoadingProgress(event.data.progress ?? 0);
                break;
            case 'ready':
                setIsModelLoading(false);
                logger.info('Whisper model is ready.');
                break;
            case 'interim-result':
                setInterimTranscript(output);
                break;
            case 'complete':
                setIsTranscribing(false);
                setFinalTranscript(output);
                setInterimTranscript(''); // Clear interim when final is ready
                logger.info('Transcription completed.', { output });
                break;
            case 'error':
                setIsModelLoading(false);
                setIsTranscribing(false);
                logger.error('Whisper worker error:', event.data.message);
                break;
            default:
                if (event.data.file) { // Progress update
                    setModelLoadingProgress(event.data.progress);
                }
                break;
        }
    }, []);

    const speechEndTimer = useRef<number | null>(null);

    const onSpeechEnd = useCallback(() => {
        if (speechEndTimer.current) {
            clearTimeout(speechEndTimer.current);
        }
        // Wait a moment after speech ends to ensure we have the full utterance
        speechEndTimer.current = window.setTimeout(() => {
            if (worker.current && audioBuffer.current.length > 0) {
                const combinedAudio = new Float32Array(audioBuffer.current.reduce((acc, val) => acc + val.length, 0));
                let offset = 0;
                for (const buffer of audioBuffer.current) {
                    combinedAudio.set(buffer, offset);
                    offset += buffer.length;
                }
                
                logger.info(`Sending audio chunk of length ${combinedAudio.length} for transcription.`);
                worker.current.postMessage({ action: 'transcribe', audio: combinedAudio });
                setIsTranscribing(true);
                audioBuffer.current = []; // Clear buffer after sending
            }
        }, 500); // 500ms pause threshold
    }, []);

    useEffect(() => {
        worker.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
        worker.current.addEventListener('message', handleWorkerMessage);
        worker.current.postMessage({ action: 'load' });

        const vadOptions = {
            onSpeechStart: () => {
                logger.debug('VAD: Speech started');
                if (speechEndTimer.current) {
                    clearTimeout(speechEndTimer.current);
                }
                audioBuffer.current = [];
            },
            onSpeechEnd: onSpeechEnd,
            onSpeechData: (audio: Float32Array) => {
                audioBuffer.current.push(audio);
            },
        };

        MicVAD.new(vadOptions).then(newVad => {
            vad.current = newVad;
            setIsVadReady(true); // Set VAD ready state to true
        }).catch(error => {
            logger.error("Failed to create VAD", error);
        });

        return () => {
            worker.current?.terminate();
            vad.current?.destroy();
            if (speechEndTimer.current) {
                clearTimeout(speechEndTimer.current);
            }
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
            // If there's pending audio, process it now
            onSpeechEnd();
        }
    };

    return { interimTranscript, finalTranscript, isModelLoading, isVadReady, modelLoadingProgress, isTranscribing, startRecording, stopRecording };
};
