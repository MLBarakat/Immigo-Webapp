import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { logger } from '../logger';

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
    /** Current authoritative FSM state */
    fsm: TranscriptionState;
    /** Speculative (interim) text from Web Speech API — shown translucently */
    speculativeText: string;
    /** Accumulated historical committed text verified by the Whisper truth ledger */
    committedText: string;
    /** Active inference tier (0=WebGPU, 1=WASM SIMD, 2=Quantized Tiny, 3=Cloud WS) */
    inferenceTier: 0 | 1 | 2 | 3;
    /** Round-trip latency of the last Whisper inference pass in ms */
    lastLatencyMs: number | null;
    /** Number of consecutive failed inferences for downscaling triggers */
    consecutiveFailures: number;
    /** High-resolution timestamp when the active speech onset was captured */
    speechOnsetTs: number | null;
    /** Active operational correlation token for distributed logging streams */
    activeTraceId: string | null;
    /** Human-readable error message for troubleshooting FAILED states */
    errorMessage: string | null;
}

// ─── Action Types ─────────────────────────────────────────────────────────────

export type TranscriptionAction =
    | { type: 'SESSION_START' }
    | { type: 'SESSION_END' }
    | { type: 'SPEECH_ONSET'; payload: { onsetTs: number; traceId: string } }
    | { type: 'SPECULATIVE_UPDATE'; payload: { text: string } }
    | { type: 'WHISPER_SEND' }
    | { type: 'WHISPER_COMPLETE'; payload: { text: string; latencyMs: number } }
    | { type: 'NATIVE_TRANSCRIPT'; payload: { text: string } }
    | { type: 'WHISPER_CANCEL' }
    | { type: 'INFERENCE_FAILED'; payload: { error: string } }
    | { type: 'RECOVERY_START' }
    | { type: 'RECOVERY_COMPLETE' }
    | { type: 'TIER_DOWNSCALE' }
    | { type: 'CLEAR_TRANSCRIPT' };

// ─── Strict FSM Transition Matrix ─────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TranscriptionState, TranscriptionState[]> = {
    IDLE:        ['LISTENING', 'FAILED'],
    LISTENING:   ['IDLE', 'SPECULATIVE', 'FAILED'],
    SPECULATIVE: ['LISTENING', 'VERIFYING', 'COMMITTED', 'FAILED', 'IDLE'],
    VERIFYING:   ['COMMITTED', 'FAILED', 'LISTENING', 'IDLE'],  // IDLE added for session teardown mid-inference
    COMMITTED:   ['LISTENING', 'IDLE'],
    FAILED:      ['RECOVERING', 'IDLE'],                        // IDLE added for session teardown during failure
    RECOVERING:  ['LISTENING', 'IDLE'],
};

/** States from which SESSION_START is permitted to restart a LISTENING phase. */
const SESSION_START_PERMITTED_STATES: TranscriptionState[] = ['IDLE', 'COMMITTED', 'FAILED', 'RECOVERING'];

/**
 * Validates state transitions. Returns true if the operation is valid, false otherwise.
 * Replaces loose console messaging with strict, traceable architectural logs.
 */
function isValidTransition(from: TranscriptionState, to: TranscriptionState): boolean {
    const allowed = VALID_TRANSITIONS[from].includes(to);
    if (!allowed) {
        logger.warn(`[TranscriptionFSM] Invalid lifecycle transition attempted: ${from} → ${to}. Gatekeeper blocking update.`, {
            fromState: from,
            attemptedTarget: to
        });
    }
    return allowed;
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialTranscriptionState: TranscriptionContextState = {
    fsm: 'IDLE',
    speculativeText: '',
    committedText: '',
    inferenceTier: 0,
    lastLatencyMs: null,
    consecutiveFailures: 0,
    speechOnsetTs: null,
    activeTraceId: null,
    errorMessage: null,
};

// ─── Reducer Core ─────────────────────────────────────────────────────────────

function transcriptionReducer(
    state: TranscriptionContextState,
    action: TranscriptionAction,
): TranscriptionContextState {
    switch (action.type) {

        case 'SESSION_START': {
            // Allow re-entry to LISTENING from any logically terminal or idle-equivalent state.
            // This handles both first-start (IDLE) and mid-session restarts (COMMITTED, FAILED, RECOVERING).
            if (!SESSION_START_PERMITTED_STATES.includes(state.fsm)) return state;
            return {
                ...initialTranscriptionState,
                fsm: 'LISTENING',
                inferenceTier: state.inferenceTier // Preserve active capability tier across sessions
            };
        }

        case 'SESSION_END': {
            if (!isValidTransition(state.fsm, 'IDLE')) return state;
            return {
                ...state,
                fsm: 'IDLE',
                speculativeText: '',
                activeTraceId: null
            };
        }

        case 'SPEECH_ONSET': {
            if (!isValidTransition(state.fsm, 'SPECULATIVE')) return state;
            return {
                ...state,
                fsm: 'SPECULATIVE',
                speechOnsetTs: action.payload.onsetTs,
                activeTraceId: action.payload.traceId
            };
        }

        case 'SPECULATIVE_UPDATE': {
            // Rigid guard: block speculative updates if the thread isn't actively collecting vocalizations
            if (state.fsm !== 'SPECULATIVE' && state.fsm !== 'VERIFYING') return state;
            return { ...state, speculativeText: action.payload.text };
        }

        case 'WHISPER_SEND': {
            if (!isValidTransition(state.fsm, 'VERIFYING')) return state;
            return { ...state, fsm: 'VERIFYING' };
        }

        case 'WHISPER_COMPLETE': {
            if (!isValidTransition(state.fsm, 'COMMITTED')) return state;
            
            // MERGE browser speculative text with Whisper final text for immediate
            // first-word display while preserving full accuracy in committed history.
            // - Browser STT provides fast interim results (~200ms)
            // - Whisper provides accurate final transcription (~800ms-1s delay)
            // - Merge removes exact word duplicates at the boundary, keeps both portions
            const whisperText = action.payload.text.trim();
            const browserText = state.speculativeText.trim();
            
            let combinedText: string;
            if (!browserText) {
              combinedText = whisperText;
            } else if (!whisperText) {
              combinedText = browserText;
            } else {
              // First check: if entire browser text is a prefix of whisper text,
              // just use whisper text (it already contains everything browser said + more)
              const browserLower = browserText.toLowerCase().replace(/[.,;:!?]/g, '');
              const whisperLower = whisperText.toLowerCase().replace(/[.,;:!?]/g, '');
              if (whisperLower.startsWith(browserLower)) {
                // Browser text is fully contained at the start of whisper text
                combinedText = whisperText;
              } else {
                // Boundary-aware deduplication: remove overlapping prefix (max 3 words)
                const browserWords = browserText.trim().split(/\s+/);
                const whisperWords = whisperText.trim().split(/\s+/);
                
                let overlapLen = 0;
                const maxOverlap = Math.min(browserWords.length, whisperWords.length, 3);
                
                for (let i = 1; i <= maxOverlap; i++) {
                  const browserTail = browserWords.slice(-i).join(' ').toLowerCase().replace(/[.,;:!?]/g, '');
                  const whisperHead = whisperWords.slice(0, i).join(' ').toLowerCase().replace(/[.,;:!?]/g, '');
                  if (browserTail === whisperHead) {
                    overlapLen = i;
                  } else {
                    break;
                  }
                }
                
                if (overlapLen > 0) {
                  // Remove overlapped portion from Whisper, keep browser text + rest of Whisper
                  const nonOverlappingWhisper = whisperWords.slice(overlapLen).join(' ');
                  combinedText = `${browserText} ${nonOverlappingWhisper}`.trim();
                } else {
                  // No overlap - concatenate browser first words + Whisper rest
                  combinedText = `${browserText} ${whisperText}`.trim();
                }
              }
            }
            
            // FIXED: Accumulate historical transcript payload sentences to safeguard
            // conversational context, using the merged text so user sees first words
            // immediately rather than waiting for full Whisper inference.
            const addition = combinedText;
            const accumulatedHistory = state.committedText.trim()
                ? `${state.committedText} ${addition}`.replace(/\s+/g, ' ').trim()
                : addition;
            
            // Immediately return to LISTENING so the next SPEECH_ONSET is accepted mid-session.
            // Without this, the FSM strands in COMMITTED and blocks all subsequent utterances.
            return {
                ...state,
                fsm: 'LISTENING',
                committedText: accumulatedHistory,
                speculativeText: '',
                lastLatencyMs: action.payload.latencyMs,
                consecutiveFailures: 0,
                errorMessage: null
            };
        }

        case 'NATIVE_TRANSCRIPT': {
            const addition = action.payload.text.trim();
            if (!addition || state.fsm === 'IDLE') return state;

            const accumulatedHistory = state.committedText.trim()
                ? `${state.committedText} ${addition}`.replace(/\s+/g, ' ').trim()
                : addition;
            return {
                ...state,
                fsm: state.fsm === 'SPECULATIVE' || state.fsm === 'VERIFYING' ? 'LISTENING' : state.fsm,
                committedText: accumulatedHistory,
                speculativeText: '',
                lastLatencyMs: 0,
            };
        }

        case 'WHISPER_CANCEL': {
            if (state.fsm !== 'VERIFYING' && state.fsm !== 'SPECULATIVE') return state;
            return { 
                ...state, 
                fsm: 'LISTENING', 
                speculativeText: '' 
            };
        }

        case 'INFERENCE_FAILED': {
            if (state.fsm === 'FAILED') {
                return {
                    ...state,
                    consecutiveFailures: state.consecutiveFailures + 1,
                    errorMessage: action.payload.error
                };
            }
            if (!isValidTransition(state.fsm, 'FAILED')) return state;
            return {
                ...state,
                fsm: 'FAILED',
                consecutiveFailures: state.consecutiveFailures + 1,
                errorMessage: action.payload.error
            };
        }

        case 'RECOVERY_START': {
            if (!isValidTransition(state.fsm, 'RECOVERING')) return state;
            return { ...state, fsm: 'RECOVERING' };
        }

        case 'RECOVERY_COMPLETE': {
            if (!isValidTransition(state.fsm, 'LISTENING')) return state;
            return { 
                ...state, 
                fsm: 'LISTENING', 
                speculativeText: '',
                errorMessage: null 
            };
        }

        case 'TIER_DOWNSCALE': {
            const boundaryNextTier = Math.min(state.inferenceTier + 1, 3) as 0 | 1 | 2 | 3;
            logger.info(`Orchestrator downscaling execution lane index to profile tier: ${boundaryNextTier}`);
            return { ...state, inferenceTier: boundaryNextTier };
        }

        case 'CLEAR_TRANSCRIPT':
            return { 
                ...state, 
                speculativeText: '', 
                committedText: '' 
            };

        default:
            return state;
    }
}

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