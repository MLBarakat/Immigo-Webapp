import { describe, expect, it } from 'vitest';
import { getDefaultTimeZoneForState, isSupportedUSTimeZone, US_STATES, US_TIME_ZONES } from '../usLocation';

describe('US location preferences', () => {
  it('offers all 50 states and defaults states to their primary time zone', () => {
    expect(US_STATES).toHaveLength(50);
    expect(getDefaultTimeZoneForState('CA')).toBe('America/Los_Angeles');
    expect(getDefaultTimeZoneForState('TX')).toBe('America/Chicago');
    expect(getDefaultTimeZoneForState('AZ')).toBe('America/Phoenix');
  });

  it('uses UTC for an unknown or missing state and validates selectable time zones', () => {
    expect(getDefaultTimeZoneForState('')).toBe('UTC');
    expect(getDefaultTimeZoneForState('XX')).toBe('UTC');
    expect(isSupportedUSTimeZone(US_TIME_ZONES[0])).toBe(true);
    expect(isSupportedUSTimeZone('Not/A-Timezone')).toBe(false);
  });
});
