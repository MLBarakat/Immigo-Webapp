export type AppVoiceLocale = 'en-US' | 'es-ES' | 'fr-FR' | 'ar-SA';

export interface AppVoice {
  readonly id: string;
  /** Proper name used in preview introductions and accessible labels. */
  readonly name: string;
  readonly gender: 'female' | 'male';
  readonly locale: AppVoiceLocale;
  readonly isDefault: boolean;
}

/**
 * Authoritative list of supported Amazon Polly voices.
 * Exactly one female default and one male voice per supported locale (8 total).
 * Display labels are composed from `name` plus the localized gender in the UI.
 */
export const APP_VOICES: readonly AppVoice[] = [
  // English
  { id: 'Ruth', name: 'Ruth', gender: 'female', locale: 'en-US', isDefault: true },
  { id: 'Matthew', name: 'Matthew', gender: 'male', locale: 'en-US', isDefault: false },

  // Spanish
  { id: 'Mia', name: 'Mía', gender: 'female', locale: 'es-ES', isDefault: true },
  { id: 'Andres', name: 'Andrés', gender: 'male', locale: 'es-ES', isDefault: false },

  // French
  { id: 'Lea', name: 'Léa', gender: 'female', locale: 'fr-FR', isDefault: true },
  { id: 'Remi', name: 'Rémi', gender: 'male', locale: 'fr-FR', isDefault: false },

  // Arabic
  { id: 'Hala', name: 'Hala', gender: 'female', locale: 'ar-SA', isDefault: true },
  { id: 'Zayd', name: 'Zayd', gender: 'male', locale: 'ar-SA', isDefault: false },
] as const;

export const DEFAULT_VOICE_BY_LOCALE: Record<AppVoiceLocale, string> = {
  'en-US': 'Ruth',
  'es-ES': 'Mia',
  'fr-FR': 'Lea',
  'ar-SA': 'Hala',
};

const VOICE_BY_ID = new Map(APP_VOICES.map((voice) => [voice.id, voice]));

/** Legacy IDs stored by earlier releases or older clients. */
const LEGACY_VOICE_ALIASES: Record<string, string> = {
  Joanna: 'Ruth',
  Lupe: 'Mia',
  Pedro: 'Andres',
  Stephen: 'Zayd',
  'Mía': 'Mia',
  'Andrés': 'Andres',
  'Léa': 'Lea',
  'Rémi': 'Remi',
};

/** Maps a language tag (en, en-GB, es-MX, …) to a supported voice locale. */
export function getVoiceLocale(locale?: string | null): AppVoiceLocale {
  if (!locale) return 'en-US';
  const direct = locale as AppVoiceLocale;
  if (Object.prototype.hasOwnProperty.call(DEFAULT_VOICE_BY_LOCALE, direct)) return direct;

  const prefix = locale.split('-')[0].toLowerCase();
  if (prefix === 'es') return 'es-ES';
  if (prefix === 'fr') return 'fr-FR';
  if (prefix === 'ar') return 'ar-SA';
  return 'en-US';
}

/** Returns the default (female) voice ID for a language. */
export function getDefaultVoiceId(locale?: string | null): string {
  return DEFAULT_VOICE_BY_LOCALE[getVoiceLocale(locale)];
}

/** Returns the two voices available for a language, female default first. */
export function getVoicesForLocale(locale?: string | null): readonly AppVoice[] {
  const voiceLocale = getVoiceLocale(locale);
  return APP_VOICES.filter((voice) => voice.locale === voiceLocale);
}

export function getVoiceById(voiceId?: string | null): AppVoice | undefined {
  if (!voiceId) return undefined;
  return VOICE_BY_ID.get(LEGACY_VOICE_ALIASES[voiceId] ?? voiceId);
}

/**
 * Normalizes user-submitted voice IDs to canonical AWS Polly ASCII identifiers.
 * When a language is supplied, a voice from another language falls back to that
 * language's default voice.
 */
export function normalizeVoiceId(voiceId?: string | null, locale?: string | null): string {
  const fallback = getDefaultVoiceId(locale);
  if (!voiceId) return fallback;

  const canonical = LEGACY_VOICE_ALIASES[voiceId] ?? voiceId;
  const voice = VOICE_BY_ID.get(canonical);
  if (!voice) return fallback;
  if (locale === undefined || locale === null) return voice.id;
  return voice.locale === getVoiceLocale(locale) ? voice.id : fallback;
}
