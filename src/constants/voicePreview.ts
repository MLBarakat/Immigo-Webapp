import type { AppVoiceLocale } from './voices';
import { getVoiceLocale } from './voices';

/**
 * One-sentence introductions used when the user changes the Polly voice.
 * Templates stay generic so the selected voice's own name is inserted.
 */
export const VOICE_PREVIEW_SENTENCES: Record<AppVoiceLocale, readonly string[]> = {
  'en-US': [
    "Hi, I'm {{name}}, and I'll be right here to help you practice for your civics interview.",
    "Hello, I'm {{name}}, and I'm looking forward to helping you build confidence today.",
    "Hi there, I'm {{name}}, your guide for clear and friendly civics practice.",
    "Welcome, I'm {{name}}, and I'm ready to help you prepare one question at a time.",
    "Hello, I'm {{name}}, and together we'll make your civics study feel simple and encouraging.",
  ],
  'es-ES': [
    'Hola, soy {{name}} y estaré aquí para ayudarte a practicar para tu entrevista de civismo.',
    'Hola, soy {{name}} y me alegra acompañarte a ganar confianza hoy.',
    'Bienvenido, soy {{name}} y te guiaré con calma en tu práctica de civismo.',
    'Hola, soy {{name}} y estoy aquí para ayudarte a prepararte pregunta por pregunta.',
    'Hola, soy {{name}} y juntos haremos que tu estudio de civismo sea claro y sencillo.',
  ],
  'fr-FR': [
    'Bonjour, je suis {{name}} et je serai là pour vous aider à préparer votre entretien de civisme.',
    "Bonjour, je suis {{name}} et je vous accompagne avec plaisir aujourd'hui.",
    'Bienvenue, je suis {{name}} et je vous guide pas à pas dans votre pratique du civisme.',
    'Bonjour, je suis {{name}} et je suis là pour vous aider à gagner en confiance.',
    'Bonjour, je suis {{name}} et ensemble, nous allons rendre votre étude du civisme simple et claire.',
  ],
  'ar-SA': [
    'مرحبًا، أنا {{name}}، وسأكون هنا لمساعدتك على الاستعداد لمقابلتك المدنية.',
    'أهلًا، أنا {{name}}، ويسعدني أن أرافقك اليوم بثقة وهدوء.',
    'مرحبًا بك، أنا {{name}}، وسأرشدك خطوة بخطوة في تدريبك المدني.',
    'أهلًا، أنا {{name}}، وأنا هنا لمساعدتك على بناء ثقتك قبل المقابلة.',
    'مرحبًا، أنا {{name}}، ومعًا سنجعل دراسة التربية المدنية واضحة وسهلة.',
  ],
};

/**
 * Picks a preview introduction and guarantees it differs from the previous one
 * for the same language.
 */
export function pickVoicePreviewSentence(
  language: string | null | undefined,
  voiceName: string,
  previousSentence?: string | null,
): string {
  const sentences = VOICE_PREVIEW_SENTENCES[getVoiceLocale(language)]
    .map((template) => template.replace(/\{\{name\}\}/g, voiceName));
  const candidates = previousSentence
    ? sentences.filter((sentence) => sentence !== previousSentence)
    : sentences;
  const pool = candidates.length > 0 ? candidates : sentences;
  return pool[Math.floor(Math.random() * pool.length)];
}
