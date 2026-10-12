import { describe, expect, it } from 'vitest';
import { getBargeInHoldDurationMs } from '../bargeIn';

describe('getBargeInHoldDurationMs', () => {
  it('requires less confirmation as interruption sensitivity increases', () => {
    expect(getBargeInHoldDurationMs('aggressive')).toBe(0);
    expect(getBargeInHoldDurationMs('balanced')).toBe(150);
    expect(getBargeInHoldDurationMs('relaxed')).toBe(400);
  });
});
