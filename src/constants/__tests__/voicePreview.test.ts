import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickVoicePreviewSentence, VOICE_PREVIEW_SENTENCES } from '../voicePreview';

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

    const renderedEnglish = VOICE_PREVIEW_SENTENCES['en-US']
      .map((template) => template.replace(/\{\{name\}\}/g, 'Ruth'));
    expect(second).not.toBe(first);
    expect(renderedEnglish).toContain(first);
    expect(renderedEnglish).toContain(second);
  });

  it('falls back to English for an unsupported language', () => {
    const sentence = pickVoicePreviewSentence('de-DE', 'Ruth');

    expect(VOICE_PREVIEW_SENTENCES['en-US'].map((template) => template.replace(/\{\{name\}\}/g, 'Ruth')))
      .toContain(sentence);
  });
});
