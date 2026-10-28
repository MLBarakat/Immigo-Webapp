import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  acquirePollyPlaybackElement,
  unlockAudioPlayback,
  getMicrophoneConstraints,
  setPreferredInputDeviceId,
} from '../audioUtils';

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Regression suite for the shared Polly playback element and the mobile
 * autoplay unlock. These behaviors are load-bearing for BOTH platforms:
 *  - iOS relies on ONE long-lived element that is unlocked inside a gesture
 *    and then reused by swapping `src` (a fresh element is always blocked).
 *  - Desktop relies on the guards that keep the unlock from ever cutting off
 *    audible turn audio mid-playback.
 */

// jsdom does not implement HTMLMediaElement playback, so we drive the element
// through a controllable fake that satisfies `instanceof HTMLMediaElement`.
type FakeMediaElement = HTMLAudioElement & {
  __paused: boolean;
  __playCalls: number;
  __srcHistory: string[];
};

function makeFakeMediaElement(): FakeMediaElement {
  const el = document.createElement('audio') as FakeMediaElement;
  el.__paused = true;
  el.__playCalls = 0;
  el.__srcHistory = [];
  let srcValue = '';

  Object.defineProperty(el, 'src', {
    configurable: true,
    get: () => srcValue,
    set: (v: string) => {
      srcValue = v;
      el.__srcHistory.push(v);
    },
  });
  Object.defineProperty(el, 'paused', {
    configurable: true,
    get: () => el.__paused,
  });
  el.load = vi.fn(() => undefined) as unknown as HTMLAudioElement['load'];
  el.play = vi.fn(() => {
    el.__playCalls += 1;
    el.__paused = false;
    return Promise.resolve();
  }) as unknown as HTMLAudioElement['play'];
  el.pause = vi.fn(() => {
    el.__paused = true;
  }) as unknown as HTMLAudioElement['pause'];
  return el;
}

describe('acquirePollyPlaybackElement (shared singleton element)', () => {
  let elements: FakeMediaElement[];

  beforeEach(() => {
    elements = [];
    // Every `new Audio()` returns a fresh fake, but the module caches the
    // first one — so the assertion is that the module hands back the SAME
    // element on every acquire rather than constructing a new one per turn.
    vi.stubGlobal('Audio', vi.fn(() => {
      const el = makeFakeMediaElement();
      elements.push(el);
      return el;
    }));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:silent-wav'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('returns the same long-lived element for every turn', () => {
    const first = acquirePollyPlaybackElement('blob:turn-1');
    const second = acquirePollyPlaybackElement('blob:turn-2');
    expect(second).toBe(first);
  });

  it('clears the previous turn handlers and swaps in the new source', () => {
    const el = acquirePollyPlaybackElement('blob:turn-1');
    const staleOnEnded = vi.fn();
    const staleOnError = vi.fn();
    el.onended = staleOnEnded;
    el.onerror = staleOnError;

    const reused = acquirePollyPlaybackElement('blob:turn-2');
    expect(reused.onended).toBeNull();
    expect(reused.onerror).toBeNull();
    expect(reused.src).toBe('blob:turn-2');
    // A stale handler must never survive into the next turn's playback.
    expect(reused.onended).not.toBe(staleOnEnded);
  });

  it('honours the load() prefetch hint without throwing', () => {
    const el = acquirePollyPlaybackElement('blob:turn-1');
    expect(el.load).toHaveBeenCalledTimes(1);
  });
});

describe('unlockAudioPlayback (mobile autoplay unlock guards)', () => {
  let el: FakeMediaElement;

  beforeEach(() => {
    vi.stubGlobal('Audio', vi.fn(() => {
      el = makeFakeMediaElement();
      return el;
    }));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:silent-wav'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not touch the element while it is actively playing audio', async () => {
    // A turn is in flight: element is playing and NOT on the silent WAV.
    const turn = acquirePollyPlaybackElement('blob:turn-audible');
    // Simulate playback having started (iOS real elements report paused=false).
    (turn as unknown as { __paused: boolean }).__paused = false;
    const srcBeforeUnlock = turn.src;
    const playCallsBefore = (turn as unknown as { __playCalls: number }).__playCalls;

    unlockAudioPlayback();
    await Promise.resolve();

    // Desktop-safety guard: the unlock must NOT swap src or re-play, which
    // would cut off the audible turn mid-sentence.
    expect(turn.src).toBe(srcBeforeUnlock);
    expect((turn as unknown as { __playCalls: number }).__playCalls).toBe(playCallsBefore);
  });

  it('unlocks a paused element by playing the silent WAV', async () => {
    const turn = acquirePollyPlaybackElement('blob:turn-idle');
    expect((turn as unknown as { __paused: boolean }).__paused).toBe(true);

    unlockAudioPlayback();
    await Promise.resolve();
    await Promise.resolve();

    // The unlock played the element (authorizing it for iOS)...
    expect((turn as unknown as { __playCalls: number }).__playCalls).toBe(1);
    // ...and, because src is still the silent WAV, paused it again so nothing
    // is ever heard.
    expect(turn.pause).toHaveBeenCalled();
  });

  it('does not pause the element after unlock when a newer turn already swapped src', async () => {
    const turn = acquirePollyPlaybackElement('blob:turn-idle');

    // Kick off the silent unlock; its play() promise has not resolved yet.
    unlockAudioPlayback();

    // A new turn swaps its audible audio onto the shared element BEFORE the
    // unlock's play() promise resolves.
    acquirePollyPlaybackElement('blob:turn-next-audible');
    const pauseCallsBefore = (turn as unknown as { pause: ReturnType<typeof vi.fn> }).pause.mock.calls.length;

    // Now let the unlock's play() promise resolve.
    await Promise.resolve();
    await Promise.resolve();

    // The deferred unlock pause must NOT fire against the newer audio — that
    // is the desktop race that would silence a live turn.
    expect((turn as unknown as { pause: ReturnType<typeof vi.fn> }).pause.mock.calls.length).toBe(pauseCallsBefore);
    expect(turn.src).toBe('blob:turn-next-audible');
  });
});

function audioTrackConstraints(constraints: MediaStreamConstraints): MediaTrackConstraints {
  return constraints.audio as MediaTrackConstraints;
}

describe('getMicrophoneConstraints (FR-005-B channel isolation)', () => {
  it('isolates to a single mono capture lane by default', () => {
    const constraints = getMicrophoneConstraints();
    expect(audioTrackConstraints(constraints).channelCount).toEqual({ ideal: 1, max: 1 });
    expect(audioTrackConstraints(constraints).echoCancellation).toBe(true);
    expect(audioTrackConstraints(constraints).noiseSuppression).toBe(true);
    expect(constraints.video).toBe(false);
  });

  it('honours caller overrides for the processing chain', () => {
    const constraints = getMicrophoneConstraints({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    });
    expect(audioTrackConstraints(constraints).echoCancellation).toBe(false);
    expect(audioTrackConstraints(constraints).noiseSuppression).toBe(false);
    expect(audioTrackConstraints(constraints).autoGainControl).toBe(true);
  });

  it('uses the saved microphone unless the caller explicitly requests the default', () => {
    setPreferredInputDeviceId('mic-bluetooth');
    expect(audioTrackConstraints(getMicrophoneConstraints()).deviceId).toEqual({ ideal: 'mic-bluetooth' });

    // The settings test button passes null to mean "system default"; it must
    // not silently fall back to the saved device.
    expect(audioTrackConstraints(getMicrophoneConstraints({ deviceId: null })).deviceId).toBeUndefined();
    setPreferredInputDeviceId(null);
  });
});
