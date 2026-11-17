// amplify/functions/transcript/turn/mode-onboarding.ts
// Deterministic Practice/Study onboarding copy.
//
// The mode transition is a product decision point, not a conversation: the
// learner must see the same explanation and the same progress counts every
// time, in their language, without an LLM deciding what to say. This module
// keeps that copy pure and testable.

import type { SimulationMode, TestVersion } from './types';

export type OnboardingLanguage = 'en-US' | 'es-ES' | 'fr-FR' | 'ar-SA';

/** English display name used inside model prompts for each supported locale. */
export const LANGUAGE_PROMPT_NAMES: Record<OnboardingLanguage, string> = {
  'en-US': 'English',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'ar-SA': 'Arabic',
};

export interface ModeProgressCounts {
  mastered: number;
  practicedNotMastered: number;
  notPracticed: number;
}

export interface ModeOnboardingStats {
  overall: ModeProgressCounts;
  focus: ModeProgressCounts;
  focusLabels: string[];
  allFocusAreas: boolean;
}

const MODE_LABELS: Record<OnboardingLanguage, Record<'practice' | 'study', string>> = {
  'en-US': { practice: 'Practice Mode', study: 'Study Mode' },
  'es-ES': { practice: 'Modo práctica', study: 'Modo estudio' },
  'fr-FR': { practice: 'Mode entraînement', study: 'Mode Étude' },
  'ar-SA': { practice: 'وضع التدريب', study: 'وضع الدراسة' },
};

const FIRST_TIME_COPY: Record<OnboardingLanguage, Record<'practice' | 'study', string>> = {
  'en-US': {
    practice: 'Practice Mode is ready. It mirrors the civics interview: one question at a time, answered in your own words, with direct feedback after each answer. Practicing recall under interview conditions is what builds the confidence you need for the USCIS test. Choose one focus area, or keep All focus areas, below.',
    study: 'Study Mode is ready. It walks through each civics question with a short explanation, at your own pace, so you learn the reasoning behind the answer. Understanding why an answer is right makes it stick when the officer asks the question in different words. Choose one focus area, or keep All focus areas, below.',
  },
  'es-ES': {
    practice: 'El Modo práctica está listo. Reproduce la entrevista de civismo: una pregunta a la vez, respondida con tus propias palabras y con comentarios directos después de cada respuesta. Practicar el recuerdo en condiciones de entrevista es lo que construye la confianza que necesitas para el examen de USCIS. Elige un área de enfoque o mantén Todas las áreas de enfoque abajo.',
    study: 'El Modo estudio está listo. Recorre cada pregunta de civismo con una explicación breve, a tu ritmo, para que aprendas el razonamiento detrás de la respuesta. Entender por qué una respuesta es correcta hace que se fije cuando el oficial formula la pregunta con otras palabras. Elige un área de enfoque o mantén Todas las áreas de enfoque abajo.',
  },
  'fr-FR': {
    practice: 'Le mode Pratique est prêt. Il reproduit l’entretien de civisme : une question à la fois, avec vos propres mots et un retour direct après chaque réponse. C’est en rappelant les réponses dans les conditions de l’entretien que se construit la confiance nécessaire pour le test USCIS. Choisissez un axe de travail ou conservez Tous les axes de travail ci-dessous.',
    study: 'Le mode Étude est prêt. Il parcourt chaque question de civisme avec une courte explication, à votre rythme, pour comprendre le raisonnement derrière la réponse. Comprendre pourquoi une réponse est juste aide à la retenir lorsque l’officier pose la question autrement. Choisissez un axe de travail ou conservez Tous les axes de travail ci-dessous.',
  },
  'ar-SA': {
    practice: 'وضع التدريب جاهز. يحاكي مقابلة التربية المدنية: سؤال واحد في كل مرة، تجيب بكلماتك الخاصة، مع تعليق مباشر بعد كل إجابة. التدرب على الاستدعاء في ظروف المقابلة هو ما يبني الثقة التي تحتاجها لاختبار USCIS. اختر مجال تركيز أو أبقِ جميع مجالات التركيز أدناه.',
    study: 'وضع الدراسة جاهز. يعرض كل سؤال مدني مع شرح قصير، بالسرعة التي تناسبك، لتتعلم سبب الإجابة. فهم سبب صحة الإجابة يثبتها عندما يطرح الضابط السؤال بصيغة مختلفة. اختر مجال تركيز أو أبقِ جميع مجالات التركيز أدناه.',
  },
};

const READY_PROMPT_COPY: Record<OnboardingLanguage, Record<'practice' | 'study', string>> = {
  'en-US': {
    practice: 'When you are ready, choose Ready. I will ask your first practice question.',
    study: 'When you are ready, choose Ready. I will show your first study question.',
  },
  'es-ES': {
    practice: 'Cuando estés listo, elige Listo. Te haré tu primera pregunta de práctica.',
    study: 'Cuando estés listo, elige Listo. Te mostraré tu primera pregunta de estudio.',
  },
  'fr-FR': {
    practice: 'Quand vous êtes prêt, choisissez Prêt. Je poserai votre première question d’entraînement.',
    study: 'Quand vous êtes prêt, choisissez Prêt. Je vous montrerai votre première question d’étude.',
  },
  'ar-SA': {
    practice: 'عندما تكون مستعدًا، اختر "جاهز". سأطرح عليك أول سؤال تدريبي.',
    study: 'عندما تكون مستعدًا، اختر "جاهز". سأعرض عليك أول سؤال دراسي.',
  },
};


const ALL_FOCUS_LABELS: Record<OnboardingLanguage, string> = {
  'en-US': 'All focus areas',
  'es-ES': 'Todas las áreas de enfoque',
  'fr-FR': 'Tous les axes de travail',
  'ar-SA': 'جميع مجالات التركيز',
};

export function localizedAllFocusLabel(language: OnboardingLanguage): string {
  return ALL_FOCUS_LABELS[language];
}

/** The first-time explanation shown before the focus card. */
export function buildFirstTimeOnboarding(
  mode: 'practice' | 'study',
  language: OnboardingLanguage,
): string {
  return FIRST_TIME_COPY[language][mode];
}

/** The explicit confirmation step after the learner chooses Ready. */
export function buildModeReadyPrompt(
  mode: 'practice' | 'study',
  language: OnboardingLanguage,
): string {
  return READY_PROMPT_COPY[language][mode];
}

/** The returning explanation with overall counts and the current focus subset. */
export function buildReturningOnboarding(
  mode: 'practice' | 'study',
  testVersion: TestVersion,
  stats: ModeOnboardingStats,
  language: OnboardingLanguage,
  options: { readyGate?: boolean } = {},
): string {
  const { overall, focus, focusLabels, allFocusAreas } = stats;
  const readyGate = options.readyGate === true;
  switch (language) {
    case 'es-ES':
      return [
        `${MODE_LABELS['es-ES'][mode]} está listo. En el banco de preguntas de ${testVersion}, ${overall.mastered} preguntas están dominadas, ${overall.practicedNotMastered} están practicadas pero aún no dominadas, y ${overall.notPracticed} no se han practicado.`,
        allFocusAreas
          ? 'Ahora mismo abarcas Todas las áreas de enfoque.'
          : `En tu enfoque actual (${focusLabels.join(', ')}), ${focus.mastered} están dominadas, ${focus.practicedNotMastered} están practicadas pero no dominadas, y ${focus.notPracticed} no se han practicado.`,
        readyGate
          ? `${allFocusAreas ? 'Tu enfoque guardado se mantiene en Todas las áreas de enfoque.' : `Tu enfoque guardado se mantiene en ${focusLabels.join(', ')}.`} Elige Listo cuando estés listo para comenzar.`
          : (allFocusAreas
            ? 'Mantén Todas las áreas de enfoque o elige un enfoque más concreto abajo.'
            : 'Mantén este enfoque o elige otro abajo.'),
      ].join(' ');
    case 'fr-FR':
      return [
        `${MODE_LABELS['fr-FR'][mode]} est prêt. Dans le banque de questions ${testVersion}, ${overall.mastered} questions sont maîtrisées, ${overall.practicedNotMastered} sont travaillées mais pas encore maîtrisées, et ${overall.notPracticed} n’ont pas encore été travaillées.`,
        allFocusAreas
          ? 'Vous couvrez actuellement Tous les axes de travail.'
          : `Dans votre axe actuel (${focusLabels.join(', ')}), ${focus.mastered} sont maîtrisées, ${focus.practicedNotMastered} sont travaillées mais pas maîtrisées, et ${focus.notPracticed} n’ont pas encore été travaillées.`,
        readyGate
          ? `${allFocusAreas ? 'Votre axe enregistré reste Tous les axes de travail.' : `Votre axe enregistré reste ${focusLabels.join(', ')}.`} Choisissez Prêt quand vous êtes prêt à commencer.`
          : (allFocusAreas
            ? 'Conservez Tous les axes de travail ou choisissez un axe plus précis ci-dessous.'
            : 'Conservez cet axe ou choisissez-en un autre ci-dessous.'),
      ].join(' ');
    case 'ar-SA':
      return [
        `${MODE_LABELS['ar-SA'][mode]} جاهز. في بنك أسئلة ${testVersion}، هناك ${overall.mastered} سؤالًا متقنًا، و${overall.practicedNotMastered} سؤالًا تم التدرب عليه دون إتقانه بعد، و${overall.notPracticed} سؤالًا لم يتم التدرب عليه.`,
        allFocusAreas
          ? 'أنت تغطي الآن جميع مجالات التركيز.'
          : `في تركيزك الحالي (${focusLabels.join('، ')})، هناك ${focus.mastered} سؤالًا متقنًا، و${focus.practicedNotMastered} سؤالًا تم التدرب عليه دون إتقانه، و${focus.notPracticed} سؤالًا لم يتم التدرب عليه.`,
        readyGate
          ? `${allFocusAreas ? 'يبقى تركيزك المحفوظ على جميع مجالات التركيز.' : `يبقى تركيزك المحفوظ على ${focusLabels.join('، ')}.`} اختر "جاهز" عندما تكون مستعدًا للبدء.`
          : (allFocusAreas
            ? 'أبقِ جميع مجالات التركيز أو اختر تركيزًا أضيق أدناه.'
            : 'أبقِ هذا التركيز أو اختر تركيزًا آخر أدناه.'),
      ].join(' ');
    default:
      return [
        `${MODE_LABELS['en-US'][mode]} is ready. Across the ${testVersion} question bank, ${overall.mastered} questions are mastered, ${overall.practicedNotMastered} are practiced but not yet mastered, and ${overall.notPracticed} have not been practiced.`,
        allFocusAreas
          ? 'You are currently covering All focus areas.'
          : `In your current focus (${focusLabels.join(', ')}), ${focus.mastered} are mastered, ${focus.practicedNotMastered} are practiced but not mastered, and ${focus.notPracticed} have not been practiced.`,
        readyGate
          ? `${allFocusAreas ? 'Your saved focus stays All focus areas.' : `Your saved focus stays ${focusLabels.join(', ')}.`} Choose Ready when you are ready to begin.`
          : (allFocusAreas
            ? 'Keep All focus areas or choose a narrower focus below.'
            : 'Keep this focus or choose another one below.'),
      ].join(' ');
  }
}

/** Confirmation after the learner chooses a focus and presses Continue. */
export function buildFocusConfirmation(
  mode: 'practice' | 'study',
  allFocusAreas: boolean,
  focusLabels: string[],
  language: OnboardingLanguage,
): string {
  const focus = allFocusAreas
    ? ALL_FOCUS_LABELS[language]
    : focusLabels.join(language === 'ar-SA' ? '، ' : ', ');
  switch (language) {
    case 'es-ES':
      return `Perfecto. Usaremos ${focus} en ${MODE_LABELS['es-ES'][mode]}.`;
    case 'fr-FR':
      return `Parfait. Nous utiliserons ${focus} en ${MODE_LABELS['fr-FR'][mode]}.`;
    case 'ar-SA':
      return `رائع. سنستخدم ${focus} في ${MODE_LABELS['ar-SA'][mode]}.`;
    default:
      return `Great. We will use ${focus} in ${MODE_LABELS['en-US'][mode]}.`;
  }
}

/** Shown when a focus pool has just completed a full pass. */
export function buildCycleNotice(language: OnboardingLanguage): string {
  switch (language) {
    case 'es-ES':
      return 'Has completado una vuelta completa por este enfoque. Empezamos de nuevo desde el principio.';
    case 'fr-FR':
      return 'Vous avez terminé un tour complet de cet axe. Nous reprenons au début.';
    case 'ar-SA':
      return 'لقد أكملت دورة كاملة في هذا التركيز. سنبدأ من البداية مرة أخرى.';
    default:
      return 'You have completed a full pass through this focus. Starting again from the beginning.';
  }
}

export function modeLabel(
  mode: Exclude<SimulationMode, 'standard'>,
  language: OnboardingLanguage,
): string {
  return MODE_LABELS[language][mode];
}

/** Shared rule: below 60% accuracy recommends guided review, at/above recommends practice. */
export function recommendLearningMode(accuracyPercent: number): 'practice' | 'study' {
  return accuracyPercent < 60 ? 'study' : 'practice';
}

const RECOMMENDATION_REASONS: Record<OnboardingLanguage, Record<'practice' | 'study', string>> = {
  'en-US': {
    practice: 'A short practice set can reinforce what you know and strengthen recall.',
    study: 'A guided review can help rebuild the concepts behind missed answers.',
  },
  'es-ES': {
    practice: 'Un breve conjunto de práctica puede reforzar lo que sabes y fortalecer tu memoria.',
    study: 'Una revisión guiada puede ayudar a reconstruir los conceptos detrás de las respuestas falladas.',
  },
  'fr-FR': {
    practice: 'Un court ensemble d’exercices peut renforcer ce que vous savez et consolider votre mémorisation.',
    study: 'Une révision guidée peut aider à reconstruire les concepts derrière les réponses manquées.',
  },
  'ar-SA': {
    practice: 'يمكن لمجموعة تدريبية قصيرة أن تعزز ما تعرفه وتقوي استدعاءك.',
    study: 'يمكن للمراجعة الموجهة أن تساعد في إعادة بناء المفاهيم وراء الإجابات الخاطئة.',
  },
};

/** Localized reason for the recommended mode, shown in the report fallback. */
export function recommendationReason(mode: 'practice' | 'study', language?: string | null): string {
  const lng: OnboardingLanguage = (language as OnboardingLanguage) ?? 'en-US';
  return RECOMMENDATION_REASONS[lng]?.[mode] ?? RECOMMENDATION_REASONS['en-US'][mode];
}

/** Deterministic acknowledgement when the learner switches to Standard. */
export function buildStandardModeSwitchCopy(language: OnboardingLanguage): string {
  switch (language) {
    case 'es-ES':
      return 'Has elegido la Entrevista estándar. Inicia la entrevista cuando estés listo.';
    case 'fr-FR':
      return 'Vous avez choisi l’Entretien standard. Lancez l’entretien quand vous êtes prêt.';
    case 'ar-SA':
      return 'لقد اخترت المقابلة القياسية. ابدأ المقابلة عندما تكون جاهزًا.';
    default:
      return 'You chose the Standard Interview. Start the interview when you are ready.';
  }
}
