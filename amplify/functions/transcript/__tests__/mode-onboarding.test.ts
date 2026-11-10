// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildCycleNotice,
  buildFirstTimeOnboarding,
  buildFocusConfirmation,
  buildReturningOnboarding,
  buildStandardModeSwitchCopy,
  localizedAllFocusLabel,
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
});
