/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import React, { type ReactNode } from 'react';

/**
 * Regression suite for model-readiness propagation and speech dispatch.
 *
 * These behaviors are load-bearing on BOTH platforms:
 *  - `isModelLoading` must go FALSE once the worker reports INIT_COMPLETED,
 *    otherwise the start control stays disabled forever (mic dead).
 *  - A mount that reuses the shared init (auth-settle remount during preload)
 *    must mirror the shared outcome onto its local state, or its
 *    `initStatus` stays 'initializing' forever and its transcripts never flow.
 *  - Completed speech segments must reach the worker as TRANSCRIBE messages.
 */

const { vadNewMock } = vi.hoisted(() => ({ vadNewMock: vi.fn() }));

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: { new: vadNewMock },
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type WorkerListener = (event: { data: unknown }) => void;

/** Minimal Worker double with DOM-style listener dedup semantics. */
class MockWorker {
  static instances: MockWorker[] = [];
  listeners: WorkerListener[] = [];
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    MockWorker.instances.push(this);
  }

  addEventListener(type: string, listener: WorkerListener): void {
    if (type === 'message' && !this.listeners.includes(listener)) {
      this.listeners.push(listener);
    }
  }

  removeEventListener(type: string, listener: WorkerListener): void {
    if (type === 'message') {
      this.listeners = this.listeners.filter((l) => l !== listener);
    }
  }

  dispatch(data: unknown): void {
    for (const listener of [...this.listeners]) listener({ data });
  }
}

interface FakeVad {
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

const makeVad = (): FakeVad => ({ start: vi.fn(), pause: vi.fn() });

describe('Model readiness & speech dispatch: useWhisper', () => {
  let useWhisper: typeof import('../useWhisper').useWhisper;
  let TranscriptionProvider: typeof import('../../context/TranscriptionContext').TranscriptionProvider;
  let resolveVad: ((vad: FakeVad) => void) | null;
  let vadOptions: any;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <TranscriptionProvider>{children}</TranscriptionProvider>
  );

  /** Starts shared init and settles the VAD load, leaving the worker compiling. */
  const startInit = async (result: { current: { ensureInitialized?: () => Promise<boolean> } }) => {
    let promise: Promise<boolean> | null = null;
    await act(async () => {
      promise = result.current.ensureInitialized!();
      resolveVad?.(makeVad());
      await promise;
    });
    return promise!;
  };

  /** Runs a full init to completion, including the worker's INIT_COMPLETED. */
  const initFully = async (result: { current: { ensureInitialized?: () => Promise<boolean> } }) => {
    await startInit(result);
    await act(async () => {
      MockWorker.instances[0].dispatch({ status: 'INIT_COMPLETED', payload: { tier: 'tiny' } });
    });
  };

  beforeEach(async () => {
    vi.resetModules();
    MockWorker.instances = [];
    resolveVad = null;
    vadOptions = undefined;
    vi.stubGlobal('Worker', MockWorker);
    // Node's BroadcastChannel and jsdom's EventTarget do not interoperate in
    // the test environment; the leader-election channel only needs to exist.
    vi.stubGlobal('BroadcastChannel', class {
      name: string;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      constructor(name: string) { this.name = name; }
      postMessage(): void {}
      close(): void {}
    });
    vadNewMock.mockReset();
    vadNewMock.mockImplementation((options: any) => {
      vadOptions = options;
      return new Promise<FakeVad>((resolve) => {
        resolveVad = resolve;
      });
    });
    ({ useWhisper } = await import('../useWhisper'));
    ({ TranscriptionProvider } = await import('../../context/TranscriptionContext'));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps the start control blocked while the worker compiles, then unblocks it on INIT_COMPLETED', async () => {
    const { result } = renderHook(() => useWhisper(), { wrapper });
    await startInit(result);

    // VAD is ready but the worker has not reported completion: still busy.
    expect(result.current.isModelLoading).toBe(true);
    expect(result.current.isVadReady).toBe(true);

    await act(async () => {
      MockWorker.instances[0].dispatch({ status: 'INIT_COMPLETED', payload: { tier: 'tiny' } });
    });

    // The completion signal must clear the busy flag. If it does not, the
    // start control stays disabled forever on desktop and mobile alike.
    expect(result.current.isModelLoading).toBe(false);
    expect(result.current.isInitializing).toBe(false);
    expect(result.current.initError).toBeNull();
  });

  it('ignores start taps while init is still settling, then captures once ready', async () => {
    const { result } = renderHook(() => useWhisper(), { wrapper });

    let pending: Promise<boolean> | null = null;
    await act(async () => {
      pending = result.current.ensureInitialized!();
    });

    // Tap during preload: must be ignored without advancing the FSM.
    await act(async () => {
      result.current.startRecording();
    });
    expect(result.current.currentState).toBe('IDLE');

    await act(async () => {
      resolveVad?.(makeVad());
      await pending;
    });

    // After init settles the same tap must open the microphone session.
    await act(async () => {
      result.current.startRecording();
    });
    expect(result.current.currentState).toBe('LISTENING');
  });

  it('mirrors a shared init completed by another mount onto a remount that attached mid-preload', async () => {
    const first = renderHook(() => useWhisper(), { wrapper });

    let firstPromise: Promise<boolean> | null = null;
    await act(async () => {
      firstPromise = first.result.current.ensureInitialized!();
    });

    // Remount while the shared init is still in flight (auth settle).
    const second = renderHook(() => useWhisper(), { wrapper });
    let secondPromise: Promise<boolean> | null = null;
    await act(async () => {
      secondPromise = second.result.current.ensureInitialized!();
    });

    // Worker reports completion before the VAD load settles.
    await act(async () => {
      MockWorker.instances[0].dispatch({ status: 'INIT_COMPLETED', payload: { tier: 'tiny' } });
    });
    expect(MockWorker.instances).toHaveLength(1);

    await act(async () => {
      resolveVad?.(makeVad());
      await Promise.all([firstPromise, secondPromise]);
    });

    // The remount must adopt the shared outcome — otherwise its initStatus
    // stays 'initializing' forever: the start control stays blocked and its
    // transcription dispatch never runs.
    expect(second.result.current.isModelLoading).toBe(false);
    expect(second.result.current.isVadReady).toBe(true);
    expect(second.result.current.initError).toBeNull();
    expect(first.result.current.isModelLoading).toBe(false);

    // And it must be able to actually capture speech.
    await act(async () => {
      second.result.current.startRecording();
    });
    expect(second.result.current.currentState).toBe('LISTENING');
  });

  it('adopts an already-completed shared preload as ready on a fresh mount', async () => {
    const first = renderHook(() => useWhisper(), { wrapper });
    await initFully(first.result);
    first.unmount();

    const second = renderHook(() => useWhisper(), { wrapper });
    await act(async () => {
      await second.result.current.ensureInitialized!();
    });

    expect(second.result.current.isModelLoading).toBe(false);
    expect(second.result.current.isVadReady).toBe(true);
    expect(second.result.current.initError).toBeNull();

    await act(async () => {
      second.result.current.startRecording();
    });
    expect(second.result.current.currentState).toBe('LISTENING');
  });

  it('dispatches a completed speech segment to the worker for transcription', async () => {
    const { result } = renderHook(() => useWhisper(), { wrapper });
    await initFully(result);

    await act(async () => {
      result.current.startRecording();
    });
    expect(result.current.currentState).toBe('LISTENING');

    // VAD callbacks drive the pipeline exactly as production audio would.
    await act(async () => {
      vadOptions.onSpeechStart();
    });
    expect(result.current.currentState).toBe('SPECULATIVE');

    await act(async () => {
      const frame = new Float32Array(16000); // 1s of 440Hz tone at 16kHz
      for (let i = 0; i < frame.length; i++) {
        frame[i] = Math.sin((2 * Math.PI * 440 * i) / 16000);
      }
      vadOptions.onFrameProcessed({ isSpeech: 0.95 }, frame);
    });

    await act(async () => {
      vadOptions.onSpeechEnd();
    });

    const worker = MockWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSCRIBE',
        correlationId: expect.any(String),
        payload: expect.objectContaining({
          config: expect.objectContaining({ language: 'en', task: 'transcribe' }),
        }),
      }),
      expect.any(Array),
    );
    expect(result.current.currentState).toBe('VERIFYING');
  });
});
