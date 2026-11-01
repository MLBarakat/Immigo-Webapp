// tests/unit/transcription_state.test.ts
// Characterization tests for the production transcription reducer.
//
// These tests import the real reducer from TranscriptionContext. They must never
// re-implement it: a copied reducer proves only that the copy works.

import { describe, it, expect } from 'vitest';
import {
    initialTranscriptionState,
    transcriptionReducer,
    type TranscriptionAction,
    type TranscriptionContextState,
} from '../../src/context/transcriptionReducer';

const start = (): TranscriptionContextState =>
    transcriptionReducer(initialTranscriptionState, { type: 'SESSION_START' });

const withSpeech = (): TranscriptionContextState => {
    let state = start();
    state = transcriptionReducer(state, {
        type: 'SPEECH_ONSET',
        payload: { onsetTs: 1234.5, traceId: 'trace-1234' },
    });
    return state;
};

const withWhisper = (): TranscriptionContextState => {
    let state = withSpeech();
    state = transcriptionReducer(state, { type: 'WHISPER_SEND' });
    return state;
};

const reduce = (
    state: TranscriptionContextState,
    action: TranscriptionAction,
): TranscriptionContextState => transcriptionReducer(state, action);

describe('TranscriptionFSM — production reducer', () => {
    it('starts in IDLE with an empty transcript', () => {
        expect(initialTranscriptionState.fsm).toBe('IDLE');
        expect(initialTranscriptionState.speculativeText).toBe('');
        expect(initialTranscriptionState.committedText).toBe('');
        expect(initialTranscriptionState.inferenceTier).toBe(0);
    });

    it('IDLE → LISTENING on SESSION_START', () => {
        const next = start();
        expect(next.fsm).toBe('LISTENING');
        expect(next.speculativeText).toBe('');
        expect(next.committedText).toBe('');
    });

    it('preserves the capability tier across SESSION_START', () => {
        const tiered = reduce(initialTranscriptionState, { type: 'TIER_DOWNSCALE' });
        const next = reduce(tiered, { type: 'SESSION_START' });
        expect(next.inferenceTier).toBe(1);
    });

    it('blocks SESSION_START while already LISTENING', () => {
        const listening = start();
        const next = reduce(listening, { type: 'SESSION_START' });
        expect(next).toBe(listening);
    });

    it('LISTENING → SPECULATIVE on SPEECH_ONSET with timestamp and trace', () => {
        const state = withSpeech();
        expect(state.fsm).toBe('SPECULATIVE');
        expect(state.speechOnsetTs).toBe(1234.5);
        expect(state.activeTraceId).toBe('trace-1234');
    });

    it('populates speculativeText only while collecting speech', () => {
        const state = reduce(withSpeech(), {
            type: 'SPECULATIVE_UPDATE',
            payload: { text: 'Hello world' },
        });
        expect(state.speculativeText).toBe('Hello world');
    });

    it('ignores SPECULATIVE_UPDATE in IDLE', () => {
        const state = reduce(initialTranscriptionState, {
            type: 'SPECULATIVE_UPDATE',
            payload: { text: 'should be ignored' },
        });
        expect(state).toBe(initialTranscriptionState);
    });

    it('SPECULATIVE → VERIFYING on WHISPER_SEND', () => {
        const state = withWhisper();
        expect(state.fsm).toBe('VERIFYING');
    });

    it('WHISPER_COMPLETE merges text and returns to LISTENING', () => {
        const state = reduce(withWhisper(), {
            type: 'WHISPER_COMPLETE',
            payload: { text: 'I am a citizen', latencyMs: 320 },
        });

        expect(state.fsm).toBe('LISTENING');
        expect(state.committedText).toBe('I am a citizen');
        expect(state.speculativeText).toBe('');
        expect(state.lastLatencyMs).toBe(320);
        expect(state.consecutiveFailures).toBe(0);
        expect(state.errorMessage).toBeNull();
    });

    it('merges a browser prefix with the fuller Whisper sentence', () => {
        let state = withSpeech();
        state = reduce(state, {
            type: 'SPECULATIVE_UPDATE',
            payload: { text: 'I am' },
        });
        state = reduce(state, { type: 'WHISPER_SEND' });
        state = reduce(state, {
            type: 'WHISPER_COMPLETE',
            payload: { text: 'I am a citizen', latencyMs: 280 },
        });

        expect(state.committedText).toBe('I am a citizen');
    });

    it('removes a duplicated word at the speculative/Whisper boundary', () => {
        let state = withSpeech();
        state = reduce(state, {
            type: 'SPECULATIVE_UPDATE',
            payload: { text: 'Hello world' },
        });
        state = reduce(state, { type: 'WHISPER_SEND' });
        state = reduce(state, {
            type: 'WHISPER_COMPLETE',
            payload: { text: 'world peace', latencyMs: 250 },
        });

        expect(state.committedText).toBe('Hello world peace');
    });

    it('accumulates committed text across turns', () => {
        let state = reduce(withWhisper(), {
            type: 'WHISPER_COMPLETE',
            payload: { text: 'First sentence.', latencyMs: 200 },
        });
        state = reduce(state, {
            type: 'SPEECH_ONSET',
            payload: { onsetTs: 2000, traceId: 'trace-2' },
        });
        state = reduce(state, { type: 'WHISPER_SEND' });
        state = reduce(state, {
            type: 'WHISPER_COMPLETE',
            payload: { text: 'Second sentence.', latencyMs: 210 },
        });

        expect(state.committedText).toBe('First sentence. Second sentence.');
        expect(state.fsm).toBe('LISTENING');
    });

    it('VERIFYING → LISTENING on WHISPER_CANCEL without a failure penalty', () => {
        const state = reduce(withWhisper(), { type: 'WHISPER_CANCEL' });
        expect(state.fsm).toBe('LISTENING');
        expect(state.consecutiveFailures).toBe(0);
        expect(state.speculativeText).toBe('');
    });

    it('INFERENCE_FAILED → FAILED and increments consecutiveFailures', () => {
        const state = reduce(withWhisper(), {
            type: 'INFERENCE_FAILED',
            payload: { error: 'GPU lost' },
        });
        expect(state.fsm).toBe('FAILED');
        expect(state.consecutiveFailures).toBe(1);
        expect(state.errorMessage).toBe('GPU lost');
    });

    it('blocks FAILED → LISTENING without RECOVERY_START', () => {
        const failed = reduce(withWhisper(), {
            type: 'INFERENCE_FAILED',
            payload: { error: 'timeout' },
        });
        const blocked = reduce(failed, { type: 'RECOVERY_COMPLETE' });
        expect(blocked).toBe(failed);
        expect(blocked.fsm).toBe('FAILED');
    });

    it('recovers through FAILED → RECOVERING → LISTENING', () => {
        let state = reduce(withWhisper(), {
            type: 'INFERENCE_FAILED',
            payload: { error: 'timeout' },
        });
        state = reduce(state, { type: 'RECOVERY_START' });
        expect(state.fsm).toBe('RECOVERING');

        state = reduce(state, { type: 'RECOVERY_COMPLETE' });
        expect(state.fsm).toBe('LISTENING');
        expect(state.errorMessage).toBeNull();
    });

    it('TIER_DOWNSCALE increments and clamps inferenceTier at 3', () => {
        let state = start();
        state = reduce(state, { type: 'TIER_DOWNSCALE' });
        expect(state.inferenceTier).toBe(1);
        state = reduce(state, { type: 'TIER_DOWNSCALE' });
        state = reduce(state, { type: 'TIER_DOWNSCALE' });
        expect(state.inferenceTier).toBe(3);
        state = reduce(state, { type: 'TIER_DOWNSCALE' });
        expect(state.inferenceTier).toBe(3);
    });

    it('SESSION_END returns to IDLE and clears speculative state and trace', () => {
        let state = withSpeech();
        state = reduce(state, {
            type: 'SPECULATIVE_UPDATE',
            payload: { text: 'testing' },
        });
        state = reduce(state, { type: 'SESSION_END' });

        expect(state.fsm).toBe('IDLE');
        expect(state.speculativeText).toBe('');
        expect(state.activeTraceId).toBeNull();
    });

    it('NATIVE_TRANSCRIPT appends text and returns to LISTENING', () => {
        let state = withSpeech();
        state = reduce(state, {
            type: 'NATIVE_TRANSCRIPT',
            payload: { text: 'Native browser result' },
        });

        expect(state.fsm).toBe('LISTENING');
        expect(state.committedText).toBe('Native browser result');
        expect(state.speculativeText).toBe('');
    });

    it('ignores NATIVE_TRANSCRIPT in IDLE', () => {
        const state = reduce(initialTranscriptionState, {
            type: 'NATIVE_TRANSCRIPT',
            payload: { text: 'should be ignored' },
        });
        expect(state).toBe(initialTranscriptionState);
    });

    it('CLEAR_TRANSCRIPT clears both buffers without changing the FSM', () => {
        let state = reduce(withWhisper(), {
            type: 'WHISPER_COMPLETE',
            payload: { text: 'Some committed text', latencyMs: 100 },
        });
        state = reduce(state, { type: 'CLEAR_TRANSCRIPT' });

        expect(state.fsm).toBe('LISTENING');
        expect(state.speculativeText).toBe('');
        expect(state.committedText).toBe('');
    });
});
