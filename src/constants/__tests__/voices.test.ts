import { describe, expect, it } from 'vitest';
import {
  APP_VOICES,
  getDefaultVoiceId,
  getVoiceById,
  getVoicesForLocale,
  normalizeVoiceId,
} from '../voices';

describe('voice support for multilingual Study mode', () => {
  it.each([
    ['en-US', 'Ruth'],
    ['es-ES', 'Mia'],
    ['fr-FR', 'Lea'],
    ['ar-SA', 'Hala'],
  ])('selects the default voice for %s', (language, voice) => {
    expect(getDefaultVoiceId(language)).toBe(voice);
    expect(getVoiceById(voice)?.isDefault).toBe(true);
  });

  it('offers exactly two voices for each supported language, female default first', () => {
    expect(APP_VOICES).toHaveLength(8);
    for (const [language, expected] of [
      ['en-US', ['Ruth', 'Matthew']],
      ['es-ES', ['Mia', 'Andres']],
      ['fr-FR', ['Lea', 'Remi']],
      ['ar-SA', ['Hala', 'Zayd']],
    ] as const) {
      expect(getVoicesForLocale(language).map((voice) => voice.id)).toEqual(expected);
    }
    expect(getVoicesForLocale('es-MX').map((voice) => voice.id)).toEqual(['Mia', 'Andres']);
  });

  it('uses human-readable names with localized gender labels', () => {
    expect(getVoiceById('Mia')?.name).toBe('Mía');
    expect(getVoiceById('Andres')?.displayName).toContain('Andrés');
    expect(getVoiceById('Lea')?.name).toBe('Léa');
    expect(getVoiceById('Remi')?.name).toBe('Rémi');
  });

  it('normalizes previously saved locale voice IDs to the supported choices', () => {
    expect(normalizeVoiceId('Joanna')).toBe('Ruth');
    expect(normalizeVoiceId('Lupe')).toBe('Mia');
    expect(normalizeVoiceId('Pedro')).toBe('Andres');
    expect(normalizeVoiceId('Stephen')).toBe('Zayd');
    expect(normalizeVoiceId('Mía')).toBe('Mia');
    expect(normalizeVoiceId('Andrés')).toBe('Andres');
  });

  it('keeps a voice that belongs to the requested language', () => {
    expect(normalizeVoiceId('Matthew', 'en-US')).toBe('Matthew');
    expect(normalizeVoiceId('Andres', 'es-ES')).toBe('Andres');
    expect(normalizeVoiceId('Lea', 'fr-FR')).toBe('Lea');
  });

  it('falls back to the language default when the saved voice belongs to another language', () => {
    expect(normalizeVoiceId('Matthew', 'es-ES')).toBe('Mia');
    expect(normalizeVoiceId('Hala', 'en-US')).toBe('Ruth');
    expect(normalizeVoiceId('Joanna', 'fr-FR')).toBe('Lea');
  });

  it('falls back to the English default for unknown or missing voices', () => {
    expect(normalizeVoiceId('Celine')).toBe('Ruth');
    expect(normalizeVoiceId(null)).toBe('Ruth');
    expect(getDefaultVoiceId('xx-XX')).toBe('Ruth');
  });

  it('treats inherited object keys as unsupported locales', () => {
    expect(getDefaultVoiceId('toString')).toBe('Ruth');
    expect(normalizeVoiceId('Ruth', 'constructor')).toBe('Ruth');
  });
});
