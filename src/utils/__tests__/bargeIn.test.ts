import { describe, expect, it } from 'vitest';
import {
  getBargeInHoldDurationMs,
  hasEnoughBargeInSpeech,
  isPlaybackEchoTranscript,
} from '../bargeIn';

describe('getBargeInHoldDurationMs', () => {
  it('requires less confirmation as interruption sensitivity increases', () => {
    expect(getBargeInHoldDurationMs('aggressive')).toBe(0);
    expect(getBargeInHoldDurationMs('balanced')).toBe(150);
    expect(getBargeInHoldDurationMs('relaxed')).toBe(400);
  });

  it('recognizes assistant words echoed back by the microphone', () => {
    expect(isPlaybackEchoTranscript(
      "Let's begin. How can people",
      "Let's begin. How can people become United States citizens?"
    )).toBe(true);
    expect(isPlaybackEchoTranscript(
      'Dwight Eisenhower was the 34th president',
      'Dwight Eisenhower was the 34th president of the United States.'
    )).toBe(true);
    expect(isPlaybackEchoTranscript(
      'How can people become United States citizen',
      "Let's begin. How can people become United States citizens?"
    )).toBe(true);
  });

  it('does not classify a genuine user interruption as assistant echo', () => {
    expect(isPlaybackEchoTranscript(
      'Wait, can you explain that?',
      'How can people become United States citizens?'
    )).toBe(false);
  });

  it('waits for meaningful speech while allowing clear interruption commands', () => {
    expect(hasEnoughBargeInSpeech('how')).toBe(false);
    expect(hasEnoughBargeInSpeech('How can')).toBe(true);
    expect(hasEnoughBargeInSpeech('stop')).toBe(true);
  });
});
