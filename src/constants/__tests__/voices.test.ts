import { describe, expect, it } from 'vitest';
import { APP_VOICES, getDefaultVoiceId, normalizeVoiceId } from '../voices';

describe('voice support for multilingual Study mode', () => {
  it.each([
    ['en-US', 'Joanna'],
    ['es-ES', 'Lupe'],
    ['fr-FR', 'Lea'],
    ['ar-SA', 'Hala'],
  ])('selects a supported voice for %s', (language, voice) => {
    expect(getDefaultVoiceId(language)).toBe(voice);
    expect(APP_VOICES.some((entry) => entry.id === voice)).toBe(true);
  });

  it('normalizes previously saved locale voice IDs to the supported choices', () => {
    expect(normalizeVoiceId('Mia')).toBe('Lupe');
    expect(normalizeVoiceId('Andrés')).toBe('Pedro');
    expect(normalizeVoiceId('Ruth')).toBe('Hala');
    expect(normalizeVoiceId('Stephen')).toBe('Zayd');
  });
});
