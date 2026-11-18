import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVoicePreviewSentences, pickVoicePreviewSentence } from '../voicePreview';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('voice preview sentences', () => {
  it.each([
    ['en-US', 'Ruth'],
    ['es-ES', 'Mía'],
    ['fr-FR', 'Léa'],
    ['ar-SA', 'هالة'],
  ])('builds a one-sentence introduction in %s using the selected voice name', (language, voiceName) => {
    const sentence = pickVoicePreviewSentence(language, voiceName);

    expect(sentence).toContain(voiceName);
    expect(sentence).not.toContain('{{name}}');
    expect(sentence.trim()).toMatch(/[.!?]$/u);
    expect(sentence).not.toMatch(/[.!?]\s+\S/u);
  });

  it('never repeats the immediately previous preview for the same language', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = pickVoicePreviewSentence('en-US', 'Ruth');
    const second = pickVoicePreviewSentence('en-US', 'Ruth', first);

    const renderedEnglish = getVoicePreviewSentences('en-US')
      .map((template) => template.replace(/\{\{name\}\}/g, 'Ruth'));
    expect(second).not.toBe(first);
    expect(renderedEnglish).toContain(first);
    expect(renderedEnglish).toContain(second);
  });

  it('falls back to English for an unsupported language', () => {
    const sentence = pickVoicePreviewSentence('de-DE', 'Ruth');

    expect(getVoicePreviewSentences('en-US').map((template) => template.replace(/\{\{name\}\}/g, 'Ruth')))
      .toContain(sentence);
  });

  it('offers five localized sentences for every supported locale', () => {
    for (const locale of ['en-US', 'es-ES', 'fr-FR', 'ar-SA']) {
      expect(getVoicePreviewSentences(locale)).toHaveLength(5);
    }
  });
});
