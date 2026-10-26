// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import englishBank from '../english-bank.json';
import {
  ENGLISH_EXERCISES,
  getEnglishExercise,
  gradeEnglishReading,
  normalizeEnglishExerciseText,
  parseEnglishWritingGrade,
  pickEnglishExercisePrompts,
  resolveEnglishSectionProgress,
} from '../english-exercises';

afterEach(() => vi.restoreAllMocks());

describe('English practice bank integrity', () => {
  it('contains complete, distinct reading and writing sentence lists with stable identifiers', () => {
    const allPrompts = [...englishBank.reading, ...englishBank.writing];
    const ids = allPrompts.map((prompt) => prompt.id);
    expect(ids.length).toBe(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(allPrompts.every((prompt) => prompt.id && prompt.sentence.trim().length > 0)).toBe(true);
    expect(englishBank.reading.map((prompt) => prompt.id)).toEqual(ENGLISH_EXERCISES.reading.map((prompt) => prompt.id));
    expect(englishBank.writing.map((prompt) => prompt.id)).toEqual(ENGLISH_EXERCISES.writing.map((prompt) => prompt.id));
    expect(englishBank.source.readingVocabulary).toContain('M-715_reading.pdf');
    expect(englishBank.source.writingVocabulary).toContain('M-715_writing.pdf');
    expect(englishBank.format.sentencesPerSection).toBe(3);
  });

  it('picks exactly three distinct in-bank items without mutating the source bank', () => {
    const originalReading = ENGLISH_EXERCISES.reading.map((prompt) => prompt.id);
    const originalWriting = ENGLISH_EXERCISES.writing.map((prompt) => prompt.id);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    for (const section of ['reading', 'writing'] as const) {
      const picked = pickEnglishExercisePrompts(section);
      expect(picked).toHaveLength(3);
      expect(new Set(picked).size).toBe(3);
      expect(picked.every((id) => getEnglishExercise(section, id) !== null)).toBe(true);
    }
    expect(ENGLISH_EXERCISES.reading.map((prompt) => prompt.id)).toEqual(originalReading);
    expect(ENGLISH_EXERCISES.writing.map((prompt) => prompt.id)).toEqual(originalWriting);
  });

  it('returns null for a stale or wrong-section prompt id', () => {
    expect(getEnglishExercise('reading', 'missing-id')).toBeNull();
    expect(getEnglishExercise('writing', 'read-01')).toBeNull();
  });
});

describe('English answer grading helpers', () => {
  it('normalizes case, punctuation, and straight or curly apostrophes', () => {
    expect(normalizeEnglishExerciseText('Citizens’ rights, U.S.!')).toBe('citizens rights u s');
    expect(normalizeEnglishExerciseText("People's vote.")).toBe('peoples vote');
  });

  it('accepts a clear reading transcript while tolerating case, punctuation, and omitted short words', () => {
    const grade = gradeEnglishReading('Where is the capital of the United States?', 'WHERE, capital — United States!');
    expect(grade.verdict).toBe('correct');
  });

  it('does not accept content words spoken out of order', () => {
    const grade = gradeEnglishReading('Where is the capital of the United States?', 'States, United, capital, where.');
    expect(grade.verdict).toBe('incorrect');
  });

  it('asks for a retry when the transcript is empty or only partially clear', () => {
    expect(gradeEnglishReading('Who was the first President?', '').verdict).toBe('uncertain');
    expect(gradeEnglishReading('George Washington was the first President.', 'George Washington first').verdict).toBe('uncertain');
  });

  it('validates model grading JSON and safely falls back on malformed or out-of-contract output', () => {
    expect(parseEnglishWritingGrade('{"verdict":"correct","feedback":"Well done."}')).toEqual({ verdict: 'correct', feedback: 'Well done.' });
    expect(parseEnglishWritingGrade('{"verdict":"pass","feedback":"Wrong enum"}').verdict).toBe('uncertain');
    expect(parseEnglishWritingGrade('not json').verdict).toBe('uncertain');
    expect(parseEnglishWritingGrade('{"verdict":"incorrect","feedback":"   "}').feedback).toContain('could not confidently assess');
    expect(parseEnglishWritingGrade(JSON.stringify({ verdict: 'correct', feedback: 'x'.repeat(300) })).feedback).toHaveLength(240);
  });
});

describe('English section pass and advancement policy', () => {
  it('passes reading immediately after a correct first sentence and starts writing at index zero', () => {
    expect(resolveEnglishSectionProgress('reading', [], 'correct')).toEqual({
      passed: true, complete: true, nextSection: 'writing', nextPromptIndex: 1,
    });
  });

  it('keeps the section open after the first two misses and advances after the third', () => {
    expect(resolveEnglishSectionProgress('reading', [], 'incorrect')).toMatchObject({ passed: false, complete: false, nextSection: null, nextPromptIndex: 1 });
    expect(resolveEnglishSectionProgress('reading', ['incorrect'], 'incorrect')).toMatchObject({ passed: false, complete: false, nextSection: null, nextPromptIndex: 2 });
    expect(resolveEnglishSectionProgress('reading', ['incorrect', 'incorrect'], 'incorrect')).toMatchObject({ passed: false, complete: true, nextSection: 'writing', nextPromptIndex: 3 });
  });

  it('preserves an earlier pass and marks writing completion as the end of the exam', () => {
    expect(resolveEnglishSectionProgress('writing', ['correct'], 'incorrect')).toEqual({
      passed: true, complete: true, nextSection: 'complete', nextPromptIndex: 2,
    });
    expect(resolveEnglishSectionProgress('writing', ['incorrect', 'incorrect'], 'incorrect')).toEqual({
      passed: false, complete: true, nextSection: 'complete', nextPromptIndex: 3,
    });
  });
});
