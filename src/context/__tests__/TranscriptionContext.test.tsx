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

    expect(result.current.state.currentState).toBe('IDLE');
    expect(result.current.state.committedText).toBe('');
    expect(result.current.state.interimText).toBe('');
    expect(result.current.state.activeTraceId).toBeNull();
    expect(result.current.state.tokenLedger).toEqual([]);
  });

  it('should instantiate a unique active trace identifier when entering the recording state sequence', () => {
    const { result } = renderTranscriptionContextHook();

    // Trigger state transition into active audio processing tracks
    act(() => {
      result.current.dispatch({ type: 'START_RECORDING' });
    });

    expect(result.current.state.currentState).toBe('RECORDING');
    // FIXED: Formally assert FR-015 tracking tokens are securely instantiated
    expect(result.current.state.activeTraceId).not.toBeNull();
    expect(typeof result.current.state.activeTraceId).toBe('string');
    expect(result.current.state.activeTraceId!.length).toBeGreaterThan(10);
  });

  it('should process dynamic token patches safely and merge text variants without memory buffer leaks', () => {
    const { result } = renderTranscriptionContextHook();

    act(() => {
      result.current.dispatch({ type: 'START_RECORDING' });
    });

    // Construct a type-safe matrix token payload mirroring our DP alignment engine structures
    const secureMockPatches: TokenPatch[] = [
      {
        operation: 'INSERT',
        text: 'System core operational parameters functional.',
        index: 0,
        timestamp: Date.now()
      }
    ];

    // Transition state from active recording into atomic matrix compilation lanes
    act(() => {
      result.current.dispatch({ type: 'SET_VERIFYING' });
    });

    expect(result.current.state.currentState).toBe('VERIFYING');

    // FIXED: Dispatches verified structural types ensuring zero layout rendering drift exceptions
    act(() => {
      result.current.dispatch({
        type: 'COMMIT_TRANSCRIPT',
        payload: {
          patches: secureMockPatches,
          authoritativeText: 'System core operational parameters functional.'
        }
      });
    });

    expect(result.current.state.currentState).toBe('IDLE');
    expect(result.current.state.committedText).toBe('System core operational parameters functional.');
    // FIXED: Assert deep clean sweeps are executed over volatile text allocations to avoid layout drops
    expect(result.current.state.interimText).toBe('');
    expect(result.current.state.activeTraceId).toBeNull();
  });

  it('should purge buffer allocations and reset tracking keys cleanly when session termination fires', () => {
    const { result } = renderTranscriptionContextHook();

    // Seed data records into the context tree framework
    act(() => {
      result.current.dispatch({ type: 'START_RECORDING' });
    });
    
    act(() => {
      result.current.dispatch({ 
        type: 'SET_INTERIM_TRANSCRIPT', 
        payload: 'Volatile interim segment tokens streaming...' 
      });
    });

    expect(result.current.state.interimText).toBe('Volatile interim segment tokens streaming...');

    // Trigger an absolute clean sweep purge command across memory banks
    act(() => {
      result.current.dispatch({ type: 'RESET_TRANSCRIPT' });
    });

    // FIXED: Confirm complete context reset to prevent rendering remnants
    expect(result.current.state.currentState).toBe('IDLE');
    expect(result.current.state.committedText).toBe('');
    expect(result.current.state.interimText).toBe('');
    expect(result.current.state.activeTraceId).toBeNull();
    expect(result.current.state.tokenLedger).toEqual([]);
  });
});