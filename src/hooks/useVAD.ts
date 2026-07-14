// src/hooks/useVAD.ts
// T008: Browser-native VAD wrapper hook using @ricky0123/vad-web MicVAD.
// T010: Injects high-resolution performance.now() timestamps for TTFC logging.
// T024: Pauses VAD frame accumulation during AI speaking state (echo suppression).

import { useState, useEffect, useRef, useCallback } from 'react';
import { MicVAD } from '@ricky0123/vad-web';
import { logger } from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VADHook {
    /** True while the VAD is fully initialized and ready to start */
    vadReady: boolean;
    /** True while the VAD is actively listening (between start() and pause()) */
    isListening: boolean;
    /** True during an active speech segment (between onSpeechStart and onSpeechEnd) */
    isSpeechActive: boolean;
    /** Start the VAD — requests microphone permission on first call */
    startListening: () => void;
    /** Pause the VAD without destroying it */
    stopListening: () => void;
    /**
     * Suppress VAD frame accumulation during AI audio playback.
     * Set to true when AI is speaking, false when playback ends.
     * Prevents echo from the speaker feeding back into the mic buffer.
     */
    setEchoSuppression: (suppressed: boolean) => void;
}

export interface VADCallbacks {
    /** Called when a speech segment is detected (speech onset) */
    onSpeechStart?: (onsetTs: number) => void;
    /** Called at speech end with the collected audio Float32Array */
    onSpeechEnd?: (audio: Float32Array, durationMs: number) => void;
    /** Called on each VAD frame during an active speech segment */
    onFrame?: (frame: Float32Array) => void;
    /** Called when VAD detects a very short noise burst (misfire) */
    onMisfire?: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVAD(callbacks: VADCallbacks = {}): VADHook {
    const [vadReady, setVadReady] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeechActive, setIsSpeechActive] = useState(false);

    const vadRef = useRef<MicVAD | null>(null);
    const echoSuppressionRef = useRef(false);
    const speechOnsetTsRef = useRef<number>(0);

    // Keep callbacks fresh without re-initializing the VAD instance
    const callbacksRef = useRef(callbacks);
    useEffect(() => {
        callbacksRef.current = callbacks;
    });

    useEffect(() => {
        let destroyed = false;

        MicVAD.new({
            // Speech detection thresholds ?" tuned for conversational speech
            positiveSpeechThreshold: 0.70,
            negativeSpeechThreshold: 0.65,
            minSpeechFrames: 3,
            redemptionFrames: 8,

            onSpeechStart: () => {
                if (destroyed) return;

                // T010: Capture high-resolution timestamp for TTFC measurement
                const onsetTs = performance.now();
                speechOnsetTsRef.current = onsetTs;
                logger.debug('VAD: speech onset', { onsetTs });

                setIsSpeechActive(true);
                callbacksRef.current.onSpeechStart?.(onsetTs);
            },

            onSpeechEnd: (audio?: Float32Array) => {
                if (destroyed) return;

                // T010: Compute speech segment duration for latency telemetry
                const endTs = performance.now();
                const durationMs = endTs - speechOnsetTsRef.current;
                logger.debug('VAD: speech end', { durationMs, audioLength: audio?.length ?? 0 });

                setIsSpeechActive(false);

                if (audio && audio.length > 0) {
                    callbacksRef.current.onSpeechEnd?.(audio, durationMs);
                }
            },

            onVADMisfire: () => {
                if (destroyed) return;
                logger.debug('VAD: misfire (short noise burst ignored)');
                setIsSpeechActive(false);
                callbacksRef.current.onMisfire?.();
            },

            onFrameProcessed: (_probabilities: any, frame: Float32Array) => {
                if (destroyed) return;

                // T024: Echo suppression — skip frames during AI playback
                if (echoSuppressionRef.current) return;

                callbacksRef.current.onFrame?.(frame);
            },
        })
            .then((vad) => {
                if (destroyed) {
                    vad.destroy();
                    return;
                }
                vadRef.current = vad;
                setVadReady(true);
                logger.info('VAD initialized and ready');

                // Expose for DevTools debugging
                try { (window as any).__vadInstance = vad; } catch (_) {}
            })
            .catch((err: unknown) => {
                logger.error('VAD initialization failed', undefined, {
                    errorMessage: err instanceof Error ? err.message : String(err),
                });
            });

        return () => {
            destroyed = true;
            vadRef.current?.destroy();
            vadRef.current = null;
        };
    }, []); // Intentionally empty — VAD singleton persists for the component lifetime

    const startListening = useCallback(() => {
        const vad = vadRef.current;
        if (!vad || vad.listening) return;
        vad.start();
        setIsListening(true);
        logger.info('VAD: started listening');
    }, []);

    const stopListening = useCallback(() => {
        const vad = vadRef.current;
        if (!vad || !vad.listening) return;
        vad.pause();
        setIsListening(false);
        setIsSpeechActive(false);
        logger.info('VAD: stopped listening');
    }, []);

    // T024: Echo suppression setter — ref-based to avoid React re-render
    const setEchoSuppression = useCallback((suppressed: boolean) => {
        echoSuppressionRef.current = suppressed;
        if (suppressed) {
            logger.debug('VAD: echo suppression ON (AI speaking)');
        } else {
            logger.debug('VAD: echo suppression OFF (AI playback ended)');
        }
    }, []);

    return { vadReady, isListening, isSpeechActive, startListening, stopListening, setEchoSuppression };
}
