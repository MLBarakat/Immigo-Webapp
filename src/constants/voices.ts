export interface AppVoice {
  readonly id: string;
  readonly displayName: string;
  readonly gender: 'female' | 'male';
  readonly locale: 'en-US' | 'es-ES' | 'fr-FR' | 'ar-SA';
  readonly accentLabel: string;
  readonly isDefault: boolean;
}

/**
 * Authoritative list of supported Amazon Polly Neural voices.
 * Exactly 1 female (default) and 1 male voice per supported locale (8 total).
 * All 8 are confirmed supported by AWS Polly Neural engine in us-east-1.
 */
export const APP_VOICES: readonly AppVoice[] = [
  // English (US)
  { id: 'Joanna', displayName: 'Joanna (Female)', gender: 'female', locale: 'en-US', accentLabel: 'English (US)', isDefault: true },
  { id: 'Matthew', displayName: 'Matthew (Male)', gender: 'male', locale: 'en-US', accentLabel: 'English (US)', isDefault: false },

  // Spanish (LatAm - Mia & Andrés)
  { id: 'Mia', displayName: 'Mia (Femenino)', gender: 'female', locale: 'es-ES', accentLabel: 'Español (LatAm)', isDefault: true },
  { id: 'Andres', displayName: 'Andrés (Masculino)', gender: 'male', locale: 'es-ES', accentLabel: 'Español (LatAm)', isDefault: false },

  // French (France)
  { id: 'Lea', displayName: 'Léa (Féminin)', gender: 'female', locale: 'fr-FR', accentLabel: 'Français (FR)', isDefault: true },
  { id: 'Remi', displayName: 'Rémi (Masculin)', gender: 'male', locale: 'fr-FR', accentLabel: 'Français (FR)', isDefault: false },

  // Arabic
  { id: 'Hala', displayName: 'هالة (أنثى)', gender: 'female', locale: 'ar-SA', accentLabel: 'العربية (AR)', isDefault: true },
  { id: 'Zayd', displayName: 'زيد (ذكر)', gender: 'male', locale: 'ar-SA', accentLabel: 'العربية (AR)', isDefault: false },
] as const;

export const DEFAULT_VOICE_BY_LOCALE: Record<string, string> = {
  'en-US': 'Joanna',
  'es-ES': 'Mia',
  'fr-FR': 'Lea',
  'ar-SA': 'Hala',
};

/** Set of valid voice IDs for rapid lookup and validation */
export const VALID_VOICE_IDS = new Set<string>([
  'Joanna',
  'Matthew',
  'Mia',
  'Andres',
  'Andrés',
  'Lea',
  'Remi',
  'Hala',
  'Zayd',
]);

/**
 * Returns the default female voice ID for a given locale code.
 * Falls back to 'Joanna' if the locale is unmapped or unrecognized.
 */
export function getDefaultVoiceId(locale?: string | null): string {
  if (!locale) return 'Joanna';
  const directMatch = DEFAULT_VOICE_BY_LOCALE[locale];
  if (directMatch) return directMatch;

  const prefix = locale.split('-')[0].toLowerCase();
  if (prefix === 'es') return 'Mia';
  if (prefix === 'fr') return 'Lea';
  if (prefix === 'ar') return 'Hala';
  return 'Joanna';
}

/**
 * Normalizes user-submitted voice IDs to canonical AWS Polly ASCII identifiers.
 */
export function normalizeVoiceId(voiceId?: string | null): string {
  if (!voiceId) return 'Joanna';
  if (voiceId === 'Andrés') return 'Andres';
  if (VALID_VOICE_IDS.has(voiceId)) return voiceId;
  return 'Joanna';
}
