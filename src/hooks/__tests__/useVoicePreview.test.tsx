import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../services/apiClient';
import { useVoicePreview } from '../useVoicePreview';

const audioMocks = vi.hoisted(() => {
  const player = {
    play: vi.fn().mockResolvedValue(undefined),
    onended: null as (() => void) | null,
  };
  return {
    player,
    acquirePollyPlaybackElement: vi.fn(() => player),
    unlockAudioPlayback: vi.fn(),
  };
});

vi.mock('../../utils/audioUtils', () => ({
  acquirePollyPlaybackElement: audioMocks.acquirePollyPlaybackElement,
  unlockAudioPlayback: audioMocks.unlockAudioPlayback,
}));

function apiClientWithSynthesis(): ApiClient {
  return {
    synthesizeSpeechText: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  } as unknown as ApiClient;
}

beforeEach(() => {
  audioMocks.player.play.mockClear().mockResolvedValue(undefined);
  audioMocks.player.onended = null;
  audioMocks.acquirePollyPlaybackElement.mockClear();
  audioMocks.unlockAudioPlayback.mockClear();
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:voice-preview'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useVoicePreview', () => {
  it('synthesizes and plays a new local preview in the selected voice', async () => {
    const apiClient = apiClientWithSynthesis();
    const { result } = renderHook(() => useVoicePreview(apiClient));

    await act(async () => {
      await result.current('Matthew', 'en-US', 'Matthew');
    });

    expect(audioMocks.unlockAudioPlayback).toHaveBeenCalledTimes(1);
    expect(apiClient.synthesizeSpeechText).toHaveBeenCalledWith(
      expect.stringContaining('Matthew'),
      expect.objectContaining({ voiceId: 'Matthew', preferredLanguage: 'en-US' })
    );
    expect(audioMocks.acquirePollyPlaybackElement).toHaveBeenCalledWith('blob:voice-preview');
    expect(audioMocks.player.play).toHaveBeenCalledTimes(1);
  });

  it('uses a different introduction on every consecutive preview', async () => {
    const apiClient = apiClientWithSynthesis();
    const { result } = renderHook(() => useVoicePreview(apiClient));

    await act(async () => {
      await result.current('Ruth', 'en-US', 'Ruth');
    });
    await act(async () => {
      await result.current('Ruth', 'en-US', 'Ruth');
    });

    const first = vi.mocked(apiClient.synthesizeSpeechText).mock.calls[0][0];
    const second = vi.mocked(apiClient.synthesizeSpeechText).mock.calls[1][0];
    expect(second).not.toBe(first);
  });

  it('releases the preview audio URL when playback ends', async () => {
    const apiClient = apiClientWithSynthesis();
    const { result } = renderHook(() => useVoicePreview(apiClient));

    await act(async () => {
      await result.current('Ruth', 'en-US', 'Ruth');
    });
    audioMocks.player.onended?.();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice-preview');
  });

  it('does nothing without an API client', async () => {
    const { result } = renderHook(() => useVoicePreview(null));

    await act(async () => {
      await result.current('Ruth', 'en-US', 'Ruth');
    });

    expect(audioMocks.acquirePollyPlaybackElement).not.toHaveBeenCalled();
  });
});
