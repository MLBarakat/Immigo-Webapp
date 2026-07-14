// src/context/TranscriptionContext.tsx
//
// Central FSM state registry for the dual-track speech transcription pipeline.
// Manages the 7-state lifecycle from idle capture through committed output.
//
// State Machine:
//   IDLE → LISTENING → SPECULATIVE → VERIFYING → COMMITTED
//                                              ↘ FAILED → RECOVERING → IDLE

import React, { createContext, useContext, useReducer, useCallback } from 'react';

// ─── FSM State Definitions ────────────────────────────────────────────────────

export type TranscriptionState =
    | 'IDLE'        // No active session; VAD and worker both paused
    | 'LISTENING'   // Session active; VAD is open but no speech detected yet
    | 'SPECULATIVE' // Speech onset detected; speculative interim text rendering
    | 'VERIFYING'   // Audio chunk sent to Whisper worker; awaiting neural result
    | 'COMMITTED'   // Whisper result merged and rendered as final committed text
    | 'FAILED'      // Unrecoverable inference error or timeout
    | 'RECOVERING'; // Transitional cooldown before returning to LISTENING

// ─── Context Payload ──────────────────────────────────────────────────────────

export interface TranscriptionContextState {
    /** Current FSM state */
    fsm: TranscriptionState;
    /** Speculative (interim) text from Web Speech API — shown as translucent */
    speculativeText: string;
    /** Committed (final) text verified by Whisper — shown at full opacity */
    committedText: string;
    /** Active inference tier (0=WebGPU, 1=WASM SIMD, 2=Quantized Tiny, 3=Cloud WS) */
    inferencetier: 0 | 1 | 2 | 3;
    /** Round-trip latency of the last Whisper inference in ms (null if none yet) */
    lastLatencyMs: number | null;
    /** Number of consecutive failed inferences (used for tier downscaling decisions) */
    consecutiveFailures: number;
    /** Timestamp (performance.now()) when the last speech onset was detected */
    speechOnsetTs: number | null;
    /** Whether the current browser tab holds the WebSocket leader lock */
    isWebSocketLeader: boolean;
    /** Human-readable error message for FAILED state */
    errorMessage: string | null;
}

// ─── Action Types ─────────────────────────────────────────────────────────────

export type TranscriptionAction =
    | { type: 'SESSION_START' }
    | { type: 'SESSION_END' }
    | { type: 'SPEECH_ONSET'; payload: { onsetTs: number } }
    | { type: 'SPECULATIVE_UPDATE'; payload: { text: string } }
    | { type: 'WHISPER_SEND' }
    | { type: 'WHISPER_COMPLETE'; payload: { text: string; latencyMs: number } }
    | { type: 'WHISPER_CANCEL' }
    | { type: 'INFERENCE_FAILED'; payload: { error: string } }
    | { type: 'RECOVERY_COMPLETE' }
    | { type: 'TIER_DOWNSCALE' }
    | { type: 'WEBSOCKET_LEADER_ACQUIRED' }
    | { type: 'WEBSOCKET_LEADER_RELEASED' }
    | { type: 'CLEAR_TRANSCRIPT' };

// ─── Allowed FSM Transitions ──────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TranscriptionState, TranscriptionState[]> = {
    IDLE:        ['LISTENING'],
    LISTENING:   ['IDLE', 'SPECULATIVE'],
    SPECULATIVE: ['LISTENING', 'VERIFYING', 'COMMITTED'],
    VERIFYING:   ['COMMITTED', 'FAILED', 'LISTENING'],
    COMMITTED:   ['LISTENING', 'IDLE'],
    FAILED:      ['RECOVERING'],
    RECOVERING:  ['LISTENING', 'IDLE'],
};

function assertTransition(from: TranscriptionState, to: TranscriptionState): void {
    if (!VALID_TRANSITIONS[from].includes(to)) {
        // Non-throwing guard: log the violation but do not crash the UI
        console.warn(`[TranscriptionFSM] Invalid transition: ${from} → ${to} (ignored)`);
    }
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialTranscriptionState: TranscriptionContextState = {
    fsm: 'IDLE',
    speculativeText: '',
    committedText: '',
    inferencetier: 0,
    lastLatencyMs: null,
    consecutiveFailures: 0,
    speechOnsetTs: null,
    isWebSocketLeader: false,
    errorMessage: null,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function transcriptionReducer(
    state: TranscriptionContextState,
    action: TranscriptionAction,
): TranscriptionContextState {
    switch (action.type) {

        case 'SESSION_START': {
            assertTransition(state.fsm, 'LISTENING');
            return {
                ...initialTranscriptionState,
                fsm: 'LISTENING',
                inferencetier: state.inferencetier, // preserve tier across sessions
                isWebSocketLeader: state.isWebSocketLeader,
            };
        }

        case 'SESSION_END': {
            assertTransition(state.fsm, 'IDLE');
            return { ...state, fsm: 'IDLE', speculativeText: '' };
        }

        case 'SPEECH_ONSET': {
            assertTransition(state.fsm, 'SPECULATIVE');
            return { ...state, fsm: 'SPECULATIVE', speechOnsetTs: action.payload.onsetTs };
        }

        case 'SPECULATIVE_UPDATE': {
            if (state.fsm !== 'SPECULATIVE' && state.fsm !== 'VERIFYING') return state;
            return { ...state, speculativeText: action.payload.text };
        }

        case 'WHISPER_SEND': {
            assertTransition(state.fsm, 'VERIFYING');
            return { ...state, fsm: 'VERIFYING' };
        }

        case 'WHISPER_COMPLETE': {
            assertTransition(state.fsm, 'COMMITTED');
            return {
                ...state,
                fsm: 'COMMITTED',
                committedText: action.payload.text,
                speculativeText: '',
                lastLatencyMs: action.payload.latencyMs,
                consecutiveFailures: 0,
                errorMessage: null,
            };
        }

        case 'WHISPER_CANCEL': {
            // Worker cancelled an in-flight inference — return to listening without penalty
            if (state.fsm !== 'VERIFYING' && state.fsm !== 'SPECULATIVE') return state;
            return { ...state, fsm: 'LISTENING', speculativeText: '' };
        }

        case 'INFERENCE_FAILED': {
            assertTransition(state.fsm, 'FAILED');
            return {
                ...state,
                fsm: 'FAILED',
                consecutiveFailures: state.consecutiveFailures + 1,
                errorMessage: action.payload.error,
            };
        }

        case 'RECOVERY_COMPLETE': {
            assertTransition(state.fsm, 'LISTENING');
            return { ...state, fsm: 'LISTENING', errorMessage: null };
        }

        case 'TIER_DOWNSCALE': {
            const nextTier = Math.min(state.inferencetier + 1, 3) as 0 | 1 | 2 | 3;
            return { ...state, inferencetier: nextTier };
        }

        case 'WEBSOCKET_LEADER_ACQUIRED':
            return { ...state, isWebSocketLeader: true };

        case 'WEBSOCKET_LEADER_RELEASED':
            return { ...state, isWebSocketLeader: false };

        case 'CLEAR_TRANSCRIPT':
            return { ...state, speculativeText: '', committedText: '' };

        default:
            return state;
    }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface TranscriptionContextValue {
    state: TranscriptionContextState;
    dispatch: React.Dispatch<TranscriptionAction>;
    /** Convenience action dispatchers */
    actions: {
        startSession: () => void;
        endSession: () => void;
        speechOnset: () => void;
        speculativeUpdate: (text: string) => void;
        whisperSend: () => void;
        whisperComplete: (text: string, latencyMs: number) => void;
        whisperCancel: () => void;
        inferenceFailed: (error: string) => void;
        recoveryComplete: () => void;
        tierDownscale: () => void;
        clearTranscript: () => void;
    };
}

const TranscriptionContext = createContext<TranscriptionContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TranscriptionProvider({ children }: { children: React.ReactNode }): JSX.Element {
    const [state, dispatch] = useReducer(transcriptionReducer, initialTranscriptionState);

    const actions = {
        startSession: useCallback(() => dispatch({ type: 'SESSION_START' }), []),
        endSession: useCallback(() => dispatch({ type: 'SESSION_END' }), []),
        speechOnset: useCallback(() => dispatch({ type: 'SPEECH_ONSET', payload: { onsetTs: performance.now() } }), []),
        speculativeUpdate: useCallback((text: string) => dispatch({ type: 'SPECULATIVE_UPDATE', payload: { text } }), []),
        whisperSend: useCallback(() => dispatch({ type: 'WHISPER_SEND' }), []),
        whisperComplete: useCallback((text: string, latencyMs: number) => dispatch({ type: 'WHISPER_COMPLETE', payload: { text, latencyMs } }), []),
        whisperCancel: useCallback(() => dispatch({ type: 'WHISPER_CANCEL' }), []),
        inferenceFailed: useCallback((error: string) => dispatch({ type: 'INFERENCE_FAILED', payload: { error } }), []),
        recoveryComplete: useCallback(() => dispatch({ type: 'RECOVERY_COMPLETE' }), []),
        tierDownscale: useCallback(() => dispatch({ type: 'TIER_DOWNSCALE' }), []),
        clearTranscript: useCallback(() => dispatch({ type: 'CLEAR_TRANSCRIPT' }), []),
    };

    return (
        <TranscriptionContext.Provider value={{ state, dispatch, actions }}>
            {children}
        </TranscriptionContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTranscription(): TranscriptionContextValue {
    const ctx = useContext(TranscriptionContext);
    if (!ctx) {
        throw new Error('useTranscription must be used inside a <TranscriptionProvider>');
    }
    return ctx;
}
