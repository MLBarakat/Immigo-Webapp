import i18n from '../i18n';
import { getVoiceLocale } from './voices';

/**
 * One-sentence introductions used when the user changes the Polly voice.
 * Templates live in `conversation.json` under `voicePreview.sentences` so they
 * stay translated with the rest of the app; the selected voice's own name is
 * inserted at pick time.
 */
export function getVoicePreviewSentences(locale?: string | null): readonly string[] {
  const sentences = i18n.t('voicePreview.sentences', {
    ns: 'conversation',
    lng: getVoiceLocale(locale),
    returnObjects: true,
  });
  return Array.isArray(sentences)
    ? sentences.filter((sentence): sentence is string => typeof sentence === 'string')
    : [];
}

/**
 * Picks a preview introduction and guarantees it differs from the previous one
 * for the same language.
 */
export function pickVoicePreviewSentence(
  language: string | null | undefined,
  voiceName: string,
  previousSentence?: string | null,
): string {
  const sentences = getVoicePreviewSentences(language)
    .map((template) => template.replace(/\{\{name\}\}/g, voiceName));
  const candidates = previousSentence
    ? sentences.filter((sentence) => sentence !== previousSentence)
    : sentences;
  const pool = candidates.length > 0 ? candidates : sentences;
  return pool[Math.floor(Math.random() * pool.length)];
}
