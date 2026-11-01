import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import {
    initialTranscriptionState,
    transcriptionReducer,
    type TranscriptionAction,
    type TranscriptionContextState,
} from './transcriptionReducer';

// ─── Context Payload Infrastructure ───────────────────────────────────────────

interface TranscriptionContextValue {
    state: TranscriptionContextState;
    dispatch: React.Dispatch<TranscriptionAction>;
    actions: {
        startSession: () => void;
        endSession: () => void;
        speechOnset: (traceId: string) => void;
        speculativeUpdate: (text: string) => void;
        whisperSend: () => void;
        whisperComplete: (text: string, latencyMs: number) => void;
        nativeTranscript: (text: string) => void;
        whisperCancel: () => void;
        inferenceFailed: (error: string) => void;
        recoveryStart: () => void;
        recoveryComplete: () => void;
        tierDownscale: () => void;
        clearTranscript: () => void;
    };
}

const TranscriptionContext = createContext<TranscriptionContextValue | undefined>(undefined);

// ─── Provider Container Component ─────────────────────────────────────────────

export function TranscriptionProvider({ children }: { children: React.ReactNode }): JSX.Element {
    const [state, dispatch] = useReducer(transcriptionReducer, initialTranscriptionState);

    const startSession = useCallback(() => dispatch({ type: 'SESSION_START' }), []);
    const endSession = useCallback(() => dispatch({ type: 'SESSION_END' }), []);
    const speechOnset = useCallback((traceId: string) =>
        dispatch({ type: 'SPEECH_ONSET', payload: { onsetTs: performance.now(), traceId } }), []);
    const speculativeUpdate = useCallback((text: string) =>
        dispatch({ type: 'SPECULATIVE_UPDATE', payload: { text } }), []);
    const whisperSend = useCallback(() => dispatch({ type: 'WHISPER_SEND' }), []);
    const whisperComplete = useCallback((text: string, latencyMs: number) =>
        dispatch({ type: 'WHISPER_COMPLETE', payload: { text, latencyMs } }), []);
    const nativeTranscript = useCallback((text: string) =>
        dispatch({ type: 'NATIVE_TRANSCRIPT', payload: { text } }), []);
    const whisperCancel = useCallback(() => dispatch({ type: 'WHISPER_CANCEL' }), []);
    const inferenceFailed = useCallback((error: string) =>
        dispatch({ type: 'INFERENCE_FAILED', payload: { error } }), []);
    const recoveryStart = useCallback(() => dispatch({ type: 'RECOVERY_START' }), []);
    const recoveryComplete = useCallback(() => dispatch({ type: 'RECOVERY_COMPLETE' }), []);
    const tierDownscale = useCallback(() => dispatch({ type: 'TIER_DOWNSCALE' }), []);
    const clearTranscript = useCallback(() => dispatch({ type: 'CLEAR_TRANSCRIPT' }), []);

    const actions = useMemo(() => ({
        startSession,
        endSession,
        speechOnset,
        speculativeUpdate,
        whisperSend,
        whisperComplete,
        nativeTranscript,
        whisperCancel,
        inferenceFailed,
        recoveryStart,
        recoveryComplete,
        tierDownscale,
        clearTranscript,
    }), [
        startSession,
        endSession,
        speechOnset,
        speculativeUpdate,
        whisperSend,
        whisperComplete,
        nativeTranscript,
        whisperCancel,
        inferenceFailed,
        recoveryStart,
        recoveryComplete,
        tierDownscale,
        clearTranscript,
    ]);

    const value: TranscriptionContextValue = useMemo(() => ({
        state,
        dispatch,
        actions,
    }), [state, actions]);

    return (
        <TranscriptionContext.Provider value={value}>
            {children}
        </TranscriptionContext.Provider>
    );
}

// ─── Authoritative Consumer Hook ──────────────────────────────────────────────

export function useTranscription(): TranscriptionContextValue {
    const ctx = useContext(TranscriptionContext);
    if (!ctx) {
        throw new Error('Type Safety Exception: useTranscription must be mounted within a structural <TranscriptionProvider> wrapper.');
    }
    return ctx;
}
