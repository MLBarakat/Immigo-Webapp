// src/hooks/useWhisper.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../logger';

export interface WhisperHook {
    transcript: { text: string } | null;
    isModelLoading: boolean;
    modelLoadingProgress: number;
    isTranscribing: boolean;
    startRecording: () => void;
    stopRecording: () => void;
}

export const useWhisper = (): WhisperHook => {
    const [transcript, setTranscript] = useState<{ text: string } | null>(null);
    const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
    const [modelLoadingProgress, setModelLoadingProgress] = useState<number>(0);
    const [isTranscribing, setIsTranscribing] = useState<boolean>(false);

    const worker = useRef<Worker | null>(null);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);

    const handleWorkerMessage = useCallback((event: MessageEvent) => {
        const { status, output, message, progress } = event.data;
        switch (status) {
            case 'loading':
                setIsModelLoading(true);
                setModelLoadingProgress(progress ?? 0);
                break;
            case 'ready':
                setIsModelLoading(false);
                logger.info('Whisper model is ready.');
                break;
            case 'complete':
                setIsTranscribing(false);
                setTranscript(output);
                logger.info('Transcription completed.', { output });
                break;
            case 'error':
                setIsModelLoading(false);
                setIsTranscribing(false);
                logger.error('Whisper worker error:', message);
                break;
            default:
                // Handle progress updates during model loading
                if (event.data.file) {
                    setModelLoadingProgress(event.data.progress);
                }
                break;
        }
    }, []);

    useEffect(() => {
        // Initialize the worker
        worker.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
            type: 'module'
        });

        worker.current.addEventListener('message', handleWorkerMessage);

        // Post a message to the worker to start loading the model
        worker.current.postMessage({ action: 'load' });

        return () => {
            worker.current?.terminate();
        };
    }, [handleWorkerMessage]);

    const startRecording = async () => {
        if (mediaRecorder.current) {
            logger.warn('Recording is already in progress.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder.current = new MediaRecorder(stream);
            audioChunks.current = [];

            mediaRecorder.current.ondataavailable = (event) => {
                audioChunks.current.push(event.data);
            };

            mediaRecorder.current.onstop = async () => {
                setIsTranscribing(true);
                // Use a common audio format like webm
                const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });

                // The transformers.js pipeline expects a Float32Array of raw audio data.
                // We need to decode the audio blob to get it.
                try {
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    // Using a new AudioContext for each decoding is a safe approach
                    const audioContext = new AudioContext();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                    // TODO: Implement resampling if audioBuffer.sampleRate is not 16000
                    if (audioBuffer.sampleRate !== 16000) {
                        logger.warn(`Audio sample rate is ${audioBuffer.sampleRate}Hz, but model expects 16000Hz. Transcription quality may be affected.`);
                    }

                    const audio = audioBuffer.getChannelData(0); // Get data from the first channel
                    worker.current?.postMessage({ audio });
                    logger.info('Audio data sent to worker for transcription.');

                } catch (error) {
                    logger.error('Error decoding audio data:', error);
                    setIsTranscribing(false);
                }
            };

            mediaRecorder.current.start();
            logger.info('Recording started.');

        } catch (error) {
            logger.error('Error starting recording:', error);
        }
    };

    const stopRecording = () => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
            mediaRecorder.current.stop();
            // The onstop event will handle the rest
            logger.info('Recording stopped.');
        } else {
            logger.warn('No active recording to stop.');
        }
    };

    return { transcript, isModelLoading, modelLoadingProgress, isTranscribing, startRecording, stopRecording };
};
