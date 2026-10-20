/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import React, { type ReactNode } from 'react';

/**
 * Regression suite for model-readiness propagation, mic gating, and speech dispatch.
 *
 * These behaviors are load-bearing on BOTH platforms:
 *  - `isModelLoading` must go FALSE once the worker reports INIT_COMPLETED,
 *    otherwise the start control stays disabled forever (mic dead).
 *  - A mount that reuses the shared init (auth-settle remount during preload)
 *    must mirror the shared outcome onto its local state, or its
 *    `initStatus` stays 'initializing' forever and its transcripts never flow.
 *  - Capture may only enter LISTENING AFTER the microphone stream is live —
 *    a dead/denied stream must keep the FSM in IDLE and surface a mic error.
 *  - A resume must re-request the mic when the held stream's tracks ended.
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
  listening: boolean;
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

/** Minimal MediaStream double: one audio track the device is still delivering. */
const makeLiveStream = (): MediaStream => {
  const track = { readyState: 'live', enabled: true, stop: vi.fn() };
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
};

/**
 * MicVAD double that behaves like the real one: start() acquires the stream
 * through the options factory and flips `listening` true only on success.
 */
const makeVad = (options: any): FakeVad => {
  const vad: FakeVad = {
    listening: false,
    start: vi.fn(async () => {
      await options.getStream();
      vad.listening = true;
    }),
    pause: vi.fn(async () => {
      vad.listening = false;
    }),
  };
  return vad;
};

describe('Model readiness & speech dispatch: useWhisper', () => {
  let useWhisper: typeof import('../useWhisper').useWhisper;
  let TranscriptionProvider: typeof import('../../context/TranscriptionContext').TranscriptionProvider;
  let resolveVad: ((vad: FakeVad) => void) | null;
  let vadOptions: any;
  let currentVad: FakeVad | null;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <TranscriptionProvider>{children}</TranscriptionProvider>
  );

  /** Settles the pending MicVAD load with a capture-capable VAD. */
  const settleVadLoad = () => {
    currentVad = makeVad(vadOptions);
    resolveVad?.(currentVad);
    return currentVad;
  };

  /** Starts shared init and settles the VAD load, leaving the worker compiling. */
  const startInit = async (result: { current: { ensureInitialized?: () => Promise<boolean> } }) => {
    let promise: Promise<boolean> | null = null;
    await act(async () => {
      promise = result.current.ensureInitialized!();
      settleVadLoad();
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
    currentVad = null;
    vi.stubGlobal('Worker', MockWorker);
    // Capture provably requires a usable device stream.
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => makeLiveStream()) },
      configurable: true,
    });
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
    delete (window.navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
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
      await result.current.startRecording();
    });
    expect(result.current.currentState).toBe('IDLE');

    await act(async () => {
      settleVadLoad();
      await pending;
    });

    // After init settles the same tap must open the microphone session.
    await act(async () => {
      await result.current.startRecording();
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
      settleVadLoad();
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
      await second.result.current.startRecording();
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
      await second.result.current.startRecording();
    });
    expect(second.result.current.currentState).toBe('LISTENING');
  });

  it('dispatches a completed speech segment to the worker for transcription', async () => {
    const { result } = renderHook(() => useWhisper(), { wrapper });
    await initFully(result);

    await act(async () => {
      await result.current.startRecording();
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

  it('does not advance the FSM to LISTENING until the microphone stream is live', async () => {
    const { result } = renderHook(() => useWhisper(), { wrapper });
    await initFully(result);

    // Hold the acquisition open as if the OS permission prompt were pending.
    let releaseStream!: () => void;
    const streamGate = new Promise<void>((resolve) => { releaseStream = resolve; });
    currentVad!.start.mockImplementation(async () => {
      await streamGate;
      await vadOptions.getStream();
      currentVad!.listening = true;
    });

    let pendingStart!: Promise<boolean>;
    await act(async () => {
      pendingStart = result.current.startRecording();
    });

    // The mic is not guaranteed yet: the UI must not advertise listening.
    expect(result.current.currentState).toBe('IDLE');

    let succeeded = false;
    await act(async () => {
      releaseStream();
      succeeded = await pendingStart;
    });
    expect(succeeded).toBe(true);
    expect(result.current.currentState).toBe('LISTENING');
  });

  it('stays IDLE and surfaces a mic error when the microphone request is rejected', async () => {
    const { result } = renderHook(() => useWhisper(), { wrapper });
    await initFully(result);

    currentVad!.start.mockRejectedValue(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }),
    );

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.startRecording();
    });

    // Denied access must never look like a listening session.
    expect(succeeded).toBe(false);
    expect(result.current.currentState).toBe('IDLE');
    expect(result.current.micError).toBeTruthy();

    // After the user grants access, the retry clears the error and listens.
    currentVad!.start.mockImplementation(async () => {
      await vadOptions.getStream();
      currentVad!.listening = true;
    });
    await act(async () => {
      succeeded = await result.current.startRecording();
    });
    expect(succeeded).toBe(true);
    expect(result.current.micError).toBeNull();
    expect(result.current.currentState).toBe('LISTENING');
  });

  it('re-requests the microphone on resume when the previous stream died', async () => {
    const { result } = renderHook(() => useWhisper(), { wrapper });
    await initFully(result);
    const gum = vi.fn(async () => makeLiveStream());
    (window.navigator.mediaDevices as unknown as { getUserMedia: typeof gum }).getUserMedia = gum;

    // Tracks stopped by a remount/suspension: resuming must not pretend the
    // dead stream is usable — the mic is requested again instead.
    const deadTrack = { readyState: 'ended', enabled: true, stop: vi.fn() };
    const deadStream = {
      getAudioTracks: () => [deadTrack],
      getTracks: () => [deadTrack],
    } as unknown as MediaStream;
    const resumedDead = await vadOptions.resumeStream(deadStream);
    expect(gum).toHaveBeenCalledTimes(1);
    expect(resumedDead.getAudioTracks()[0].readyState).toBe('live');

    // A live paused stream is resumed in place: no redundant permission prompt.
    const liveTrack = { readyState: 'live', enabled: false, stop: vi.fn() };
    const liveStream = {
      getAudioTracks: () => [liveTrack],
      getTracks: () => [liveTrack],
    } as unknown as MediaStream;
    const resumedLive = await vadOptions.resumeStream(liveStream);
    expect(gum).toHaveBeenCalledTimes(1);
    expect(liveTrack.enabled).toBe(true);
    expect(resumedLive).toBe(liveStream);
  });

  it('rebuilds the VAD and re-requests the mic when start() silently leaves it not listening', async () => {
    const { result } = renderHook(() => useWhisper(), { wrapper });
    await initFully(result);

    // MicVAD permanently no-ops start() after one failed start ('errored'
    // state) — the "tap never asks for mic access" field bug. The hook must
    // detect the silent failure and rebuild the shared VAD once.
    currentVad!.start = vi.fn(async () => undefined);

    let succeeded = false;
    await act(async () => {
      const pending = result.current.startRecording();
      await vi.waitFor(() => expect(vadNewMock).toHaveBeenCalledTimes(2));
      settleVadLoad();
      succeeded = await pending;
    });

    expect(succeeded).toBe(true);
    expect(result.current.currentState).toBe('LISTENING');
    // The rebuilt VAD really acquired a device stream.
    expect(currentVad!.listening).toBe(true);
  });

  it('fails fast when start() resolves but never produces a live mic stream', async () => {
    // Field bug: a synchronous throw inside MicVAD's internal promise executor
    // makes start() RESOLVE with undefined, and MicVAD's permanent 'errored'
    // state then no-ops the rebuild. The result was a session stuck "connecting"
    // forever with no error. Neither the first start nor the rebuild may be
    // accepted unless the VAD is listening on a live stream.
    const { result } = renderHook(() => useWhisper(), { wrapper });
    await initFully(result);

    currentVad!.start = vi.fn(async () => undefined); // resolves, never listens

    let succeeded = true;
    await act(async () => {
      const pending = result.current.startRecording();
      // The hook rebuilds the shared VAD once before giving up — the rebuilt
      // instance fails exactly like the first, and only then may the error
      // surface. Settling the rebuild with another silent failure mirrors the
      // MicVAD 'errored' state in the field: every start() no-ops.
      await vi.waitFor(() => expect(vadNewMock).toHaveBeenCalledTimes(2));
      const rebuilt = settleVadLoad();
      rebuilt.start = vi.fn(async () => undefined);
      succeeded = await pending;
    });

    expect(succeeded).toBe(false);
    expect(result.current.currentState).toBe('IDLE');
    expect(result.current.micError).toBeTruthy();
    expect(currentVad!.listening).toBe(false);
  });

  it('abandons the attempt instead of hanging when the VAD never settles', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useWhisper(), { wrapper });
      await initFully(result);

      // The audio graph never comes up: start() stays pending indefinitely.
      currentVad!.start = vi.fn(() => new Promise<void>(() => undefined));

      let pendingStart!: Promise<boolean>;
      await act(async () => {
        pendingStart = result.current.startRecording();
      });

      let succeeded = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16000);
        succeeded = await pendingStart;
      });

      expect(succeeded).toBe(false);
      expect(result.current.currentState).toBe('IDLE');
      expect(result.current.micError).toBeTruthy();
      // The half-started attempt released the mic instead of leaving it live.
      expect(currentVad!.pause).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never lets the acquisition guard timer kill a successful-but-slow start', async () => {
    // Field regression: a cold-cache Silero model fetch pushed start() to
    // ~14.1s of the 15s budget. The start won the race and capture committed,
    // but the guard timer was never cleared, so ~15s after the tap the
    // orphaned timeout fired and paused the HEALTHY listening VAD — silently,
    // no log line, no error state — leaving the session "listening" on a
    // permanently muted audio graph and the mic button erroring.
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useWhisper(), { wrapper });
      await initFully(result);

      // Slow-but-successful start, just inside the budget: the mic is only
      // acquired (and listening flipped) after the simulated model fetch.
      currentVad!.start = vi.fn(async () => {
        await new Promise((resolve) => { window.setTimeout(resolve, 14000); });
        await vadOptions.getStream();
        currentVad!.listening = true;
      });
      // The hook pauses the VAD once at init; only LATER pauses are bugs.
      const pauseCallsAfterInit = currentVad!.pause.mock.calls.length;

      let succeeded = false;
      await act(async () => {
        const pending = result.current.startRecording();
        await vi.advanceTimersByTimeAsync(14100);
        succeeded = await pending;
      });

      expect(succeeded).toBe(true);
      expect(result.current.currentState).toBe('LISTENING');
      expect(result.current.micError).toBeNull();

      // Well past the 15s mark: the guard timer must have been cleared when
      // the race settled, not fired against the now-healthy VAD.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });

      expect(currentVad!.listening).toBe(true);
      expect(currentVad!.pause.mock.calls.length).toBe(pauseCallsAfterInit);
      expect(result.current.micError).toBeNull();
      expect(result.current.currentState).toBe('LISTENING');
    } finally {
      vi.useRealTimers();
    }
  });
});
