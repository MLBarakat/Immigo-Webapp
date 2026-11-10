// amplify/functions/transcript/turn/mode-onboarding.ts
// Deterministic Practice/Study onboarding copy.
//
// The mode transition is a product decision point, not a conversation: the
// learner must see the same explanation and the same progress counts every
// time, in their language, without an LLM deciding what to say. This module
// keeps that copy pure and testable.

import type { SimulationMode, TestVersion } from './types';

export type OnboardingLanguage = 'en-US' | 'es-ES' | 'fr-FR' | 'ar-SA';

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
  'fr-FR': { practice: 'Mode Pratique', study: 'Mode Étude' },
  'ar-SA': { practice: 'وضع التدريب', study: 'وضع الدراسة' },
};

const FIRST_TIME_COPY: Record<OnboardingLanguage, Record<'practice' | 'study', string>> = {
  'en-US': {
    practice: 'Practice Mode is ready. It asks you one civics question at a time. Choose one focus area, or keep All focus areas, and we will begin with your first question.',
    study: 'Study Mode is ready. It gives you each civics question with an explanation. Choose one focus area, or keep All focus areas, and we will begin with your first question.',
  },
  'es-ES': {
    practice: 'El Modo práctica está listo. Te hace una pregunta de civismo a la vez. Elige un área de enfoque o mantén Todas las áreas de enfoque, y comenzaremos con tu primera pregunta.',
    study: 'El Modo estudio está listo. Te presenta cada pregunta de civismo con una explicación. Elige un área de enfoque o mantén Todas las áreas de enfoque, y comenzaremos con tu primera pregunta.',
  },
  'fr-FR': {
    practice: 'Le mode Pratique est prêt. Il vous pose une question de civisme à la fois. Choisissez un axe de travail ou conservez Tous les axes de travail, et nous commencerons par votre première question.',
    study: 'Le mode Étude est prêt. Il présente chaque question de civisme avec une explication. Choisissez un axe de travail ou conservez Tous les axes de travail, et nous commencerons par votre première question.',
  },
  'ar-SA': {
    practice: 'وضع التدريب جاهز. يطرح عليك سؤالًا مدنيًا واحدًا في كل مرة. اختر مجال تركيز أو أبقِ جميع مجالات التركيز، وسنبدأ بسؤالك الأول.',
    study: 'وضع الدراسة جاهز. يعرض كل سؤال مدني مع شرح. اختر مجال تركيز أو أبقِ جميع مجالات التركيز، وسنبدأ بسؤالك الأول.',
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

/** The returning explanation with overall counts and the current focus subset. */
export function buildReturningOnboarding(
  mode: 'practice' | 'study',
  testVersion: TestVersion,
  stats: ModeOnboardingStats,
  language: OnboardingLanguage,
): string {
  const { overall, focus, focusLabels, allFocusAreas } = stats;
  switch (language) {
    case 'es-ES':
      return [
        `${MODE_LABELS['es-ES'][mode]} está listo. En el banco de preguntas de ${testVersion}, ${overall.mastered} preguntas están dominadas, ${overall.practicedNotMastered} están practicadas pero aún no dominadas, y ${overall.notPracticed} no se han practicado.`,
        allFocusAreas
          ? 'Ahora mismo abarcas Todas las áreas de enfoque.'
          : `En tu enfoque actual (${focusLabels.join(', ')}), ${focus.mastered} están dominadas, ${focus.practicedNotMastered} están practicadas pero no dominadas, y ${focus.notPracticed} no se han practicado.`,
        allFocusAreas
          ? 'Mantén Todas las áreas de enfoque o elige un enfoque más concreto abajo.'
          : 'Mantén este enfoque o elige otro abajo.',
      ].join(' ');
    case 'fr-FR':
      return [
        `${MODE_LABELS['fr-FR'][mode]} est prêt. Dans le banque de questions ${testVersion}, ${overall.mastered} questions sont maîtrisées, ${overall.practicedNotMastered} sont travaillées mais pas encore maîtrisées, et ${overall.notPracticed} n’ont pas encore été travaillées.`,
        allFocusAreas
          ? 'Vous couvrez actuellement Tous les axes de travail.'
          : `Dans votre axe actuel (${focusLabels.join(', ')}), ${focus.mastered} sont maîtrisées, ${focus.practicedNotMastered} sont travaillées mais pas maîtrisées, et ${focus.notPracticed} n’ont pas encore été travaillées.`,
        allFocusAreas
          ? 'Conservez Tous les axes de travail ou choisissez un axe plus précis ci-dessous.'
          : 'Conservez cet axe ou choisissez-en un autre ci-dessous.',
      ].join(' ');
    case 'ar-SA':
      return [
        `${MODE_LABELS['ar-SA'][mode]} جاهز. في بنك أسئلة ${testVersion}، هناك ${overall.mastered} سؤالًا متقنًا، و${overall.practicedNotMastered} سؤالًا تم التدرب عليه دون إتقانه بعد، و${overall.notPracticed} سؤالًا لم يتم التدرب عليه.`,
        allFocusAreas
          ? 'أنت تغطي الآن جميع مجالات التركيز.'
          : `في تركيزك الحالي (${focusLabels.join('، ')})، هناك ${focus.mastered} سؤالًا متقنًا، و${focus.practicedNotMastered} سؤالًا تم التدرب عليه دون إتقانه، و${focus.notPracticed} سؤالًا لم يتم التدرب عليه.`,
        allFocusAreas
          ? 'أبقِ جميع مجالات التركيز أو اختر تركيزًا أضيق أدناه.'
          : 'أبقِ هذا التركيز أو اختر تركيزًا آخر أدناه.',
      ].join(' ');
    default:
      return [
        `${MODE_LABELS['en-US'][mode]} is ready. Across the ${testVersion} question bank, ${overall.mastered} questions are mastered, ${overall.practicedNotMastered} are practiced but not yet mastered, and ${overall.notPracticed} have not been practiced.`,
        allFocusAreas
          ? 'You are currently covering All focus areas.'
          : `In your current focus (${focusLabels.join(', ')}), ${focus.mastered} are mastered, ${focus.practicedNotMastered} are practiced but not mastered, and ${focus.notPracticed} have not been practiced.`,
        allFocusAreas
          ? 'Keep All focus areas or choose a narrower focus below.'
          : 'Keep this focus or choose another one below.',
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
