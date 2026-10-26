/**
 * USCIS-style English practice prompts. USCIS publishes vocabulary lists but
 * does not publish the live reading/writing test sentences; these prompts are
 * original practice material built from the public vocabulary lists.
 */
import englishBankJson from './english-bank.json';

export type EnglishExerciseSection = 'reading' | 'writing';

export interface EnglishExercisePrompt {
  id: string;
  number: number;
  sentence: string;
}

export type EnglishExerciseVerdict = 'correct' | 'incorrect' | 'uncertain';

export interface EnglishExerciseGrade {
  verdict: EnglishExerciseVerdict;
  feedback: string;
}

interface EnglishBank {
  edition: string;
  reading: EnglishExercisePrompt[];
  writing: EnglishExercisePrompt[];
}

const englishBank = englishBankJson as EnglishBank;

export const ENGLISH_EXERCISES: Record<EnglishExerciseSection, EnglishExercisePrompt[]> = {
  reading: englishBank.reading,
  writing: englishBank.writing,
};

export function pickEnglishExercisePrompts(section: EnglishExerciseSection): string[] {
  const prompts = ENGLISH_EXERCISES[section].slice();
  for (let i = prompts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
  }
  return prompts.slice(0, 3).map((prompt) => prompt.id);
}

export function getEnglishExercise(section: EnglishExerciseSection, promptId: string): EnglishExercisePrompt | null {
  return ENGLISH_EXERCISES[section].find((prompt) => prompt.id === promptId) ?? null;
}

export function normalizeEnglishExerciseText(value: string): string {
  return value.toLocaleLowerCase('en-US')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Evaluate recognized reading words in sentence order; ASR confidence is not available here. */
export function gradeEnglishReading(expected: string, spoken: string): EnglishExerciseGrade {
  const functionWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'do', 'does', 'for', 'from', 'here', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'was', 'were', 'we']);
  const expectedWords = normalizeEnglishExerciseText(expected).split(' ').filter((word) => word.length > 2 && !functionWords.has(word));
  const normalizedSpoken = normalizeEnglishExerciseText(spoken);
  if (!normalizedSpoken) {
    return { verdict: 'uncertain', feedback: 'I did not catch enough of that. Please try reading the sentence once more.' };
  }
  const spokenWords = normalizedSpoken.split(' ');
  let spokenIndex = 0;
  let matched = 0;
  for (const expectedWord of expectedWords) {
    const foundAt = spokenWords.indexOf(expectedWord, spokenIndex);
    if (foundAt >= 0) {
      matched++;
      spokenIndex = foundAt + 1;
    }
  }
  const coverage = expectedWords.length ? matched / expectedWords.length : 0;
  const verdict: EnglishExerciseVerdict = coverage >= 0.8 ? 'correct' : coverage >= 0.55 ? 'uncertain' : 'incorrect';
  const feedback = verdict === 'correct'
    ? 'Nice work. I could understand the sentence.'
    : verdict === 'uncertain'
      ? 'I may not have heard every word clearly. Please try reading it once more.'
      : 'That was a good try. Listen to the sentence again, then give it another go.';
  return { verdict, feedback };
}

export function parseEnglishWritingGrade(raw: string): EnglishExerciseGrade {
  try {
    const parsed = JSON.parse(raw) as { verdict?: unknown; feedback?: unknown };
    const verdict = parsed.verdict === 'correct' || parsed.verdict === 'incorrect' || parsed.verdict === 'uncertain'
      ? parsed.verdict : 'uncertain';
    const feedback = typeof parsed.feedback === 'string' && parsed.feedback.trim().length > 0
      ? parsed.feedback.trim().slice(0, 240) : 'I could not confidently assess that sentence. Please try the next one.';
    return { verdict, feedback };
  } catch {
    return { verdict: 'uncertain', feedback: 'I could not confidently assess that sentence. Please try the next one.' };
  }
}

export function resolveEnglishSectionProgress(
  section: EnglishExerciseSection,
  previousVerdicts: readonly EnglishExerciseVerdict[],
  latestVerdict: 'correct' | 'incorrect',
): { passed: boolean; complete: boolean; nextSection: EnglishExerciseSection | 'complete' | null; nextPromptIndex: number } {
  const allVerdicts = [...previousVerdicts, latestVerdict];
  const passed = allVerdicts.includes('correct');
  const complete = passed || allVerdicts.length >= 3;
  const nextSection = !complete ? null : section === 'reading' ? 'writing' : 'complete';
  return { passed, complete, nextSection, nextPromptIndex: allVerdicts.length };
}
