// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { buildTurnPrompt, buildGreetingPrompt, parseInterpretation, TurnInterpreterAdapter, type ModelComplete } from '../turn-interpreter';
import type { CivicsItem, SessionStartContext } from '../types';

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

describe('buildGreetingPrompt — BRAND NEW USER (reported: "no greeting at all")', () => {
  const q: CivicsItem = { id: 'q1', question: 'Why is it important to pay federal taxes?', kind: 'static', acceptableAnswers: ['required by law'] };

  // Exact shape the handler constructs for a freshly-created account: empty
  // utterance (proactive sessionStart, nothing said yet), first session ever,
  // no prior session, no progress report (fetchUserProgressReport's baseline
  // string, or null/undefined if that call itself failed).
  const brandNewUserCtx: SessionStartContext = {
    userUtterance: '',
    isFirstSessionToday: true,
    daysSinceLastSession: null,
    progressReportMarkdown: 'No prior progress history available. Begin baseline assessment across American Government, American History, and Integrated Civics.',
    firstQuestion: q,
  };

  it('does NOT throw and produces a well-formed prompt for a brand new user', () => {
    expect(() => buildGreetingPrompt(brandNewUserCtx)).not.toThrow();
    const { system, user } = buildGreetingPrompt(brandNewUserCtx);
    expect(system.length).toBeGreaterThan(0);
    expect(user).toContain('no prior session (new learner)');
    expect(system).toContain(q.question);
  });

  it('also does not throw when progressReportMarkdown is null/undefined (e.g. the report fetch itself failed)', () => {
    const ctxWithNullReport: SessionStartContext = { ...brandNewUserCtx, progressReportMarkdown: null };
    expect(() => buildGreetingPrompt(ctxWithNullReport)).not.toThrow();
    const ctxWithUndefinedReport: SessionStartContext = { ...brandNewUserCtx, progressReportMarkdown: undefined };
    expect(() => buildGreetingPrompt(ctxWithUndefinedReport)).not.toThrow();
  });

  it('selects the new-student case (case 4), not a returning-user framing', () => {
    const { system } = buildGreetingPrompt(brandNewUserCtx);
    expect(system.toLowerCase()).toContain('new student');
  });

  it('handles an empty userUtterance (proactive sessionStart call, nothing said yet) without throwing', () => {
    expect(() => buildGreetingPrompt({ ...brandNewUserCtx, userUtterance: '' })).not.toThrow();
  });
});

describe('TurnInterpreterAdapter.generateGreeting — ROBUSTNESS (reported: "no greeting" / "same greeting every day")', () => {
  const q: CivicsItem = { id: 'q1', question: 'Why is it important to pay federal taxes?', kind: 'static', acceptableAnswers: ['required by law'] };
  const brandNewUserCtx: SessionStartContext = {
    userUtterance: '',
    isFirstSessionToday: true,
    daysSinceLastSession: null,
    progressReportMarkdown: null,
    firstQuestion: q,
  };

  it('returns real, non-empty text when the model call succeeds', async () => {
    const complete: ModelComplete = vi.fn(async () => 'Welcome! Ready to begin?');
    const adapter = new TurnInterpreterAdapter(complete);
    const text = await adapter.generateGreeting(brandNewUserCtx);
    expect(text).toBe('Welcome! Ready to begin?');
  });

  it('CRITICAL: still returns non-empty, speakable text when the model call THROWS (e.g. Bedrock timeout/cold-start)', async () => {
    const complete: ModelComplete = vi.fn(async () => { throw new Error('simulated Bedrock timeout'); });
    const adapter = new TurnInterpreterAdapter(complete);
    const text = await adapter.generateGreeting(brandNewUserCtx);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(q.question); // the question still gets asked even on total model failure
  });

  it('CRITICAL: still returns non-empty text when the model call returns an empty/whitespace string', async () => {
    const complete: ModelComplete = vi.fn(async () => '   ');
    const adapter = new TurnInterpreterAdapter(complete);
    const text = await adapter.generateGreeting(brandNewUserCtx);
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('this is the SAME static fallback every time the model fails — explains "I don\'t get a new greeting" if the model call is silently failing every day', async () => {
    const alwaysFails: ModelComplete = vi.fn(async () => { throw new Error('fails'); });
    const adapter = new TurnInterpreterAdapter(alwaysFails);
    const day1 = await adapter.generateGreeting(brandNewUserCtx);
    const day2 = await adapter.generateGreeting(brandNewUserCtx);
    // Documents the real behavior: if the LLM call never succeeds, every
    // day's "greeting" is this IDENTICAL hardcoded string — which is
    // indistinguishable, from the user's seat, from "never getting a new
    // greeting". This test exists to make that failure mode visible, not to
    // endorse it.
    expect(day1).toBe(day2);
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
