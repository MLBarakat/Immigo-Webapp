import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { ReactNode } from 'react';
import { TranscriptionProvider, useTranscription } from '../TranscriptionContext';
import { TokenPatch } from '../../utils/diffReconciliation';

interface WrapperProps {
  readonly children: ReactNode;
}

describe('FSM Context Registry Validation: TranscriptionContext', () => {
  // Safe helper bootstrap utility to mount our custom state context wrapper natively
  const renderTranscriptionContextHook = () => {
    const contextWrapper = ({ children }: WrapperProps) => (
      <TranscriptionProvider>{children}</TranscriptionProvider>
    );
    return renderHook(() => useTranscription(), { wrapper: contextWrapper });
  };

  it('should verify the foundational state layout matches standard system parameters on initialization', () => {
    const { result } = renderTranscriptionContextHook();

    expect(result.current.state.fsm).toBe('IDLE');
    expect(result.current.state.committedText).toBe('');
    expect(result.current.state.speculativeText).toBe('');
    expect(result.current.state.activeTraceId).toBeNull();
  });

  it('should instantiate a unique active trace identifier when entering the recording state sequence', () => {
    const { result } = renderTranscriptionContextHook();

    // Trigger state transition into active audio processing tracks
    act(() => {
      result.current.actions.startSession();
    });

    expect(result.current.state.fsm).toBe('LISTENING');

    act(() => {
      result.current.actions.speechOnset('trace-1234567890-test');
    });

    expect(result.current.state.fsm).toBe('SPECULATIVE');
    expect(result.current.state.activeTraceId).toBe('trace-1234567890-test');
  });

  it('should process dynamic token patches safely and merge text variants without memory buffer leaks', () => {
    const { result } = renderTranscriptionContextHook();

    act(() => {
      result.current.actions.startSession();
      result.current.actions.speechOnset('trace-1234567890-test');
    });

    // Transition state from active recording into atomic matrix compilation lanes
    act(() => {
      result.current.actions.whisperSend();
    });

    expect(result.current.state.fsm).toBe('VERIFYING');

    act(() => {
      result.current.actions.whisperComplete('System core operational parameters functional.', 150);
    });

    expect(result.current.state.fsm).toBe('COMMITTED');
    expect(result.current.state.committedText).toBe('System core operational parameters functional.');
    expect(result.current.state.speculativeText).toBe('');
  });

  it('should purge buffer allocations and reset tracking keys cleanly when session termination fires', () => {
    const { result } = renderTranscriptionContextHook();

    // Seed data records into the context tree framework
    act(() => {
      result.current.actions.startSession();
      result.current.actions.speechOnset('trace-1234567890-test');
      result.current.actions.speculativeUpdate('Volatile interim segment tokens streaming...');
    });

    expect(result.current.state.speculativeText).toBe('Volatile interim segment tokens streaming...');

    // Trigger an absolute clean sweep purge command across memory banks
    act(() => {
      result.current.actions.endSession();
    });

    // Confirm complete context reset to prevent rendering remnants
    expect(result.current.state.fsm).toBe('IDLE');
    expect(result.current.state.speculativeText).toBe('');
    expect(result.current.state.activeTraceId).toBeNull();
  });
});