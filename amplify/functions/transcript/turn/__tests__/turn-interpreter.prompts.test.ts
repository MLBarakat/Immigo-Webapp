// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildTurnPrompt, buildGreetingPrompt, parseInterpretation } from '../turn-interpreter';
import type { CivicsItem } from '../types';

const cabinet: CivicsItem = {
  id: 'q-cabinet',
  question: 'Name two Cabinet-level positions.',
  kind: 'static',
  acceptableAnswers: ['Secretary of State', 'Secretary of Defense'],
};

describe('buildTurnPrompt — new intents recognized', () => {
  it('parseInterpretation accepts "repeat" and "hint"', () => {
    expect(parseInterpretation('{"intent":"repeat","targetItemId":null,"grade":null,"reply":"ok"}')?.intent).toBe('repeat');
    expect(parseInterpretation('{"intent":"hint","targetItemId":null,"grade":null,"reply":"clue"}')?.intent).toBe('hint');
  });

  it('the system prompt documents repeat and hint so the model can choose them', () => {
    const { system } = buildTurnPrompt({ askedItem: cabinet }, 'can you say that again');
    expect(system).toContain('repeat:');
    expect(system).toContain('hint:');
  });
});

describe('buildTurnPrompt — content gap fixes are actually present', () => {
  it('instructs multi-part handling (partial + ask for the rest, no spoiling)', () => {
    const { system } = buildTurnPrompt({ askedItem: cabinet }, 'vice president');
    expect(system.toLowerCase()).toContain('multi-part');
    expect(system.toLowerCase()).toContain('partial');
    expect(system.toLowerCase()).toContain('do not reveal');
  });

  it('instructs explicit give-up handling (state the answer, do not loop)', () => {
    const { system } = buildTurnPrompt({ askedItem: cabinet }, "i don't know");
    expect(system.toLowerCase()).toContain('give-up');
    expect(system.toLowerCase()).toContain('state the correct answer');
  });

  it('instructs ASR/accent tolerance for matchedAnswer extraction', () => {
    const { system } = buildTurnPrompt({ askedItem: cabinet }, 'bill of rite');
    expect(system.toLowerCase()).toContain('phonetically close');
  });

  it('instructs bilingual code-switching handling', () => {
    const { system } = buildTurnPrompt({ askedItem: cabinet }, 'la constitución');
    expect(system.toLowerCase()).toContain('bilingual');
    expect(system.toLowerCase()).toContain('english');
  });

  it('includes TTS/Polly hygiene rules (no markdown, no parenthetical math, sentence cap)', () => {
    const { system } = buildTurnPrompt({ askedItem: cabinet }, 'x');
    expect(system).toContain('markdown');
    expect(system).toContain('parenthetical math');
    expect(system).toMatch(/2-3 spoken sentences/);
  });
});

describe('buildGreetingPrompt — content gap fixes are actually present', () => {
  const q: CivicsItem = { id: 'q1', question: 'Why is it important to pay federal taxes?', kind: 'static', acceptableAnswers: ['required by law'] };

  it('instructs handling anxiety/logistical questions in the user\'s initial words', () => {
    const { system } = buildGreetingPrompt({
      userUtterance: "my test is this Friday and I'm really stressed",
      isFirstSessionToday: true,
      firstQuestion: q,
    });
    expect(system.toLowerCase()).toContain('anxiety');
    expect(system.toLowerCase()).toContain('logistical');
  });

  it('surfaces long-break re-engagement when daysSinceLastSession >= 7', () => {
    const { system, user } = buildGreetingPrompt({
      userUtterance: 'hi',
      isFirstSessionToday: true,
      daysSinceLastSession: 10,
      firstQuestion: q,
    });
    expect(system.toLowerCase()).toContain('long-break');
    expect(user).toContain('long break');
  });

  it('does not flag a long break for a recent session', () => {
    const { user } = buildGreetingPrompt({
      userUtterance: 'hi',
      isFirstSessionToday: true,
      daysSinceLastSession: 1,
      firstQuestion: q,
    });
    expect(user).not.toContain('long break');
  });

  it('instructs mastery-tier framing for high-performing returning users', () => {
    const { system } = buildGreetingPrompt({
      userUtterance: 'hi',
      isFirstSessionToday: true,
      progressReportMarkdown: '# Progress\nAccuracy: 98% across all categories.',
      firstQuestion: q,
    });
    expect(system.toLowerCase()).toContain('mastery');
  });

  it('still includes the exact first question and TTS hygiene rules', () => {
    const { system } = buildGreetingPrompt({ userUtterance: 'hi', isFirstSessionToday: true, firstQuestion: q });
    expect(system).toContain(q.question);
    expect(system).toContain('markdown');
    expect(system).toContain('parenthetical math');
  });
});
