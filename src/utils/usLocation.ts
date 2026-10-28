export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
] as const;

export type USStateCode = typeof US_STATES[number][0];

// Primary/default zone for each state. Users in multi-zone states can choose
// their precise zone in account settings after selecting their state.
const STATE_DEFAULT_TIME_ZONE: Record<USStateCode, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Boise',
  IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago', KS: 'America/Chicago',
  KY: 'America/Kentucky/Louisville', LA: 'America/Chicago', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles',
  NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York',
  NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York', OK: 'America/Chicago',
  OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York',
  WI: 'America/Chicago', WY: 'America/Denver',
};

export const US_TIME_ZONES = [
  'UTC',
  'America/New_York', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Knox',
  'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Tell_City',
  'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac',
  'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'America/Chicago', 'America/Menominee',
  'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem',
  'America/Denver', 'America/Boise', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
  'America/Adak', 'America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka',
  'America/Yakutat', 'Pacific/Honolulu',
] as const;

export function getDefaultTimeZoneForState(state: string | null | undefined): string {
  if (!state) return 'UTC';
  return STATE_DEFAULT_TIME_ZONE[state as USStateCode] ?? 'UTC';
}

export function getTimeZoneLabel(timeZone: string, locale?: string): string {
  try {
    const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;
    return name ? `${name} (${timeZone.replace(/_/g, ' ')})` : timeZone;
  } catch {
    return timeZone;
  }
}

export function isSupportedUSTimeZone(timeZone: string | null | undefined): boolean {
  return !!timeZone && (US_TIME_ZONES as readonly string[]).includes(timeZone);
}
