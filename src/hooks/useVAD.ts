import { useState, useEffect, useRef, useCallback } from 'react';
import { MicVAD } from '@ricky0123/vad-web';
import { logger } from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VADHook {
    /** True while the VAD is fully initialized and ready to start */
    vadReady: boolean;
    /** True while the VAD is actively listening (between start and pause) */
    isListening: boolean;
    /** True during an active speech segment (between onSpeechStart and onSpeechEnd) */
    isSpeechActive: boolean;
    /** Start the VAD — requests microphone permission on first call */
    startListening: () => void;
    /** Pause the VAD without destroying it */
    stopListening: () => void;
    /** Suppress VAD frame accumulation during AI audio playback (echo suppression) */
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
    const [vadReady, setVadReady] = useState<boolean>(false);
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isSpeechActive, setIsSpeechActive] = useState<boolean>(false);

    const vadRef = useRef<MicVAD | null>(null);
    const echoSuppressionRef = useRef<boolean>(false);
    const speechOnsetTsRef = useRef<number>(0);

    // Keep callbacks fresh without re-initializing the VAD instance
    const callbacksRef = useRef(callbacks);
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    useEffect(() => {
        let destroyed = false;

        MicVAD.new({
            // Serve VAD assets from public/ root; the library resolves model + worklet bundle from this base path
            baseAssetPath: '/',
            // Speech detection thresholds tuned for conversational speech structures
            positiveSpeechThreshold: 0.70,
            negativeSpeechThreshold: 0.65,
            preSpeechPadMs: 500,  // FIXED: Converted from frame indexes to millisecond options
            minSpeechMs: 200,     // FIXED: Converted from frame indexes to millisecond options
            redemptionMs: 1000,   // FIXED: Converted from frame indexes to millisecond options

            onSpeechStart: () => {
                if (destroyed) return;

                const onsetTs = performance.now();
                speechOnsetTsRef.current = onsetTs;
                logger.debug('VAD standalone hook: speech onset detected.', { onsetTs });

                setIsSpeechActive(true);
                if (callbacksRef.current.onSpeechStart) {
                    callbacksRef.current.onSpeechStart(onsetTs);
                }
            },

            onSpeechEnd: (audio?: Float32Array) => {
                if (destroyed) return;

                const endTs = performance.now();
                const durationMs = endTs - speechOnsetTsRef.current;
                logger.debug('VAD standalone hook: speech end detected.', { durationMs, audioLength: audio?.length ?? 0 });

                setIsSpeechActive(false);

                if (audio && audio.length > 0) {
                    if (callbacksRef.current.onSpeechEnd) {
                        callbacksRef.current.onSpeechEnd(audio, durationMs);
                    }
                }
            },

            onVADMisfire: () => {
                if (destroyed) return;
                logger.debug('VAD standalone hook: transient noise burst ignored (misfire).');
                setIsSpeechActive(false);
                if (callbacksRef.current.onMisfire) {
                    callbacksRef.current.onMisfire();
                }
            },

            // FIXED: Eliminated loose 'any' masks from callback parameter signatures
            onFrameProcessed: (_probabilities: Record<string, number> | unknown, frame: Float32Array) => {
                if (destroyed) return;

                // Echo suppression logic gate: skip frame aggregation during active speaker playback
                if (echoSuppressionRef.current) return;

                if (callbacksRef.current.onFrame) {
                    callbacksRef.current.onFrame(frame);
                }
            },
        })
            .then((vad) => {
                if (destroyed) {
                    vad.destroy();
                    return;
                }
                vadRef.current = vad;
                setVadReady(true);
                logger.info('Standalone VAD context successfully loaded.');

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                try { (window as any).__vadInstance = vad; } catch { /* ignore */ }
            })
            .catch((err: unknown) => {
                logger.error('Standalone VAD initialization failed exception:', undefined, {
                    errorMessage: err instanceof Error ? err.message : String(err),
                });
            });

        return () => {
            destroyed = true;
            if (vadRef.current) {
                vadRef.current.destroy();
            }
            vadRef.current = null;
        };
    }, []); // Persistent singleton lifecycle across component mount lifespan

    const startListening = useCallback(() => {
        const vad = vadRef.current;
        if (!vad || vad.listening) return;
        vad.start();
        setIsListening(true);
        logger.info('Standalone VAD: started recording loop.');
    }, []);

    const stopListening = useCallback(() => {
        const vad = vadRef.current;
        if (!vad || !vad.listening) return;
        vad.pause();
        setIsListening(false);
        setIsSpeechActive(false);
        logger.info('Standalone VAD: paused recording loop.');
    }, []);

    const setEchoSuppression = useCallback((suppressed: boolean) => {
        echoSuppressionRef.current = suppressed;
        if (suppressed) {
            logger.debug('VAD Gate: Echo suppression active (Synthetic speaker channel locked).');
        } else {
            logger.debug('VAD Gate: Echo suppression released (Synthetic speaker channel clear).');
        }
    }, []);

    return { vadReady, isListening, isSpeechActive, startListening, stopListening, setEchoSuppression };
}