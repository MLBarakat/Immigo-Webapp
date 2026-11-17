// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildCycleNotice,
  buildFirstTimeOnboarding,
  buildFocusConfirmation,
  buildModeReadyPrompt,
  buildReturningOnboarding,
  buildStandardModeSwitchCopy,
  localizedAllFocusLabel,
  modeLabel,
  recommendLearningMode,
  type ModeOnboardingStats,
  type OnboardingLanguage,
} from '../turn/mode-onboarding';

const stats: ModeOnboardingStats = {
  overall: { mastered: 12, practicedNotMastered: 30, notPracticed: 86 },
  focus: { mastered: 3, practicedNotMastered: 5, notPracticed: 9 },
  focusLabels: ['Geography', 'Symbols'],
  allFocusAreas: false,
};

const languages: OnboardingLanguage[] = ['en-US', 'es-ES', 'fr-FR', 'ar-SA'];

describe('Practice/Study onboarding copy', () => {
  it('offers a deterministic first-time explanation in every locale', () => {
    for (const language of languages) {
      for (const mode of ['practice', 'study'] as const) {
        const copy = buildFirstTimeOnboarding(mode, language);
        expect(copy.length).toBeGreaterThan(40);
        expect(copy).toMatch(language === 'ar-SA' ? /[\u0600-\u06FF]/ : /[A-Za-zÀ-ÿ]/);
      }
    }
  });

  it('explains why the mode matters before inviting the learner to get ready', () => {
    expect(buildFirstTimeOnboarding('practice', 'en-US'))
      .toContain('Practicing recall under interview conditions');
    expect(buildFirstTimeOnboarding('study', 'en-US'))
      .toContain('Understanding why an answer is right');
    expect(buildFirstTimeOnboarding('practice', 'en-US'))
      .toContain('Choose one focus area');
  });

  it('provides a mode-specific Ready prompt in every locale', () => {
    for (const language of languages) {
      for (const mode of ['practice', 'study'] as const) {
        const prompt = buildModeReadyPrompt(mode, language);
        expect(prompt.length).toBeGreaterThan(30);
        expect(prompt).toMatch(language === 'ar-SA' ? /[\u0600-\u06FF]/ : /[A-Za-zÀ-ÿ]/);
      }
    }
    expect(buildModeReadyPrompt('practice', 'en-US')).toContain('first practice question');
    expect(buildModeReadyPrompt('study', 'en-US')).toContain('first study question');
  });

  it('reports overall and focus-subset counts for returning learners', () => {
    const english = buildReturningOnboarding('practice', '2020', stats, 'en-US');

    expect(english).toContain('12 questions are mastered');
    expect(english).toContain('30 are practiced but not yet mastered');
    expect(english).toContain('86 have not been practiced');
    expect(english).toContain('Geography, Symbols');
    expect(english).toContain('3 are mastered');
    expect(english).toContain('5 are practiced but not mastered');
    expect(english).toContain('9 have not been practiced');
  });

  it('keeps the resume boundary distinct from the first-time explanation', () => {
    const firstTime = buildFirstTimeOnboarding('practice', 'en-US');
    const returning = buildReturningOnboarding('practice', '2020', stats, 'en-US', { readyGate: true });

    expect(firstTime).toContain('mirrors the civics interview');
    expect(firstTime).not.toContain('questions are mastered');
    expect(returning).not.toContain('mirrors the civics interview');
    expect(returning).toContain('Your saved focus stays Geography, Symbols.');
    expect(returning).toContain('Choose Ready when you are ready to begin.');
  });

  it('keeps the saved All-focus resume boundary in every locale', () => {
    const allStats: ModeOnboardingStats = {
      ...stats,
      focus: stats.overall,
      focusLabels: [],
      allFocusAreas: true,
    };
    const expected: Record<OnboardingLanguage, string> = {
      'en-US': 'Your saved focus stays All focus areas.',
      'es-ES': 'Tu enfoque guardado se mantiene en Todas las áreas de enfoque.',
      'fr-FR': 'Votre axe enregistré reste Tous les axes de travail.',
      'ar-SA': 'يبقى تركيزك المحفوظ على جميع مجالات التركيز.',
    };
    for (const language of languages) {
      const copy = buildReturningOnboarding('study', '2020', allStats, language, { readyGate: true });
      expect(copy).toContain(expected[language]);
      expect(copy).toMatch(language === 'ar-SA' ? /جاهز/ : /Ready|Listo|Prêt/);
    }
  });

  it('describes the All focus area state without a subset list', () => {
    const allStats: ModeOnboardingStats = {
      ...stats,
      focus: stats.overall,
      focusLabels: [],
      allFocusAreas: true,
    };
    const french = buildReturningOnboarding('study', '2008', allStats, 'fr-FR');

    expect(french).toContain('Tous les axes de travail');
    expect(french).toContain('12 questions sont maîtrisées');
    expect(french).toContain('86 n’ont pas encore été travaillées');
    expect(french).not.toContain('Geography');
  });

  it('confirms the chosen focus and names the exact All sentinel per locale', () => {
    expect(buildFocusConfirmation('practice', true, [], 'en-US')).toContain('All focus areas');
    expect(buildFocusConfirmation('study', true, [], 'es-ES')).toContain(localizedAllFocusLabel('es-ES'));
    expect(buildFocusConfirmation('study', false, ['Geography'], 'ar-SA')).toContain('Geography');
    expect(localizedAllFocusLabel('ar-SA')).toBe('جميع مجالات التركيز');
  });

  it('provides a cycle notice and Standard switch copy in every locale', () => {
    for (const language of languages) {
      expect(buildCycleNotice(language).length).toBeGreaterThan(30);
      expect(buildStandardModeSwitchCopy(language).length).toBeGreaterThan(30);
    }
  });

  describe('recommendLearningMode (F4 shared rule)', () => {
    it('recommends study below the passing threshold', () => {
      expect(recommendLearningMode(59)).toBe('study');
      expect(recommendLearningMode(0)).toBe('study');
    });

    it('recommends practice at or above the passing threshold', () => {
      expect(recommendLearningMode(60)).toBe('practice');
      expect(recommendLearningMode(100)).toBe('practice');
    });
  });

  describe('modeLabel (F4 localized summary label)', () => {
    it('returns Mode entraînement for French practice', () => {
      expect(modeLabel('practice', 'fr-FR')).toBe('Mode entraînement');
    });

    it('returns localized labels for every supported locale', () => {
      expect(modeLabel('practice', 'en-US')).toBe('Practice Mode');
      expect(modeLabel('practice', 'es-ES')).toBe('Modo práctica');
      expect(modeLabel('study', 'fr-FR')).toBe('Mode Étude');
      expect(modeLabel('study', 'ar-SA')).toBe('وضع الدراسة');
    });
  });
});
