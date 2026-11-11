// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  bedrockSend: vi.fn(),
  pollySend: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  state: {
    exam: null as Record<string, unknown> | null,
    previousExam: null as Record<string, unknown> | null,
    priorEnglishRequest: null as Record<string, unknown> | null,
    answers: [] as Array<{ item_id: string; verdict: string }>,
    gradedAnswers: [] as Array<{ item_id?: string; verdict: string }>,
    sessions: [] as Array<{ id: string; local_date?: string }>,
    sessionRow: null as Record<string, unknown> | null,
    settings: null as Record<string, unknown> | null,
    updates: [] as Array<{
      table: string;
      payload: Record<string, unknown>;
      filters: Array<[string, unknown]>;
    }>,
  },
}));

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class { send = mocks.bedrockSend; },
  InvokeModelCommand: class { constructor(public input: unknown) {} },
}));

vi.mock('@aws-sdk/client-polly', () => ({
  PollyClient: class { send = mocks.pollySend; },
  SynthesizeSpeechCommand: class { constructor(public input: unknown) {} },
  VoiceId: {},
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
  SupabaseClient: class {},
}));

import { handler } from '../handler';
import { allItems, getFirstQuestion, getStudyCategoryTitle } from '../turn/bank';
import { focusedItems, normalizeFocusCategoryId } from '../turn/focus';
import { pickEnglishExercisePrompts } from '../english-exercises';
import { ApiClient } from '../../../../src/services/apiClient';

const FIRST_QUESTION = getFirstQuestion('2020');
const EXAM_ID = '11111111-1111-4111-8111-111111111111';
const STUDY_ITEM = allItems('2020').slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))[9];

function examRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: EXAM_ID,
    test_version: '2020',
    status: 'in_progress',
    question_ids: [FIRST_QUESTION.id],
    current_index: 0,
    correct_count: 0,
    incorrect_count: 0,
    include_english_simulation: false,
    english_stage: 'none',
    reading_prompt_ids: [],
    writing_prompt_ids: [],
    reading_passed: null,
    writing_passed: null,
    report_markdown: null,
    ...overrides,
  };
}

/**
 * Minimal Supabase fluent-query fake. The regression turn only reads the
 * mock_exams row; any other table resolves empty.
 */
function makeQuery(table: string) {
  const query: Record<string, unknown> = {};
  const filters: Array<[string, unknown]> = [];
  let wantsReportedExam = false;
  for (const method of ['select', 'neq', 'order', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  for (const method of ['eq', 'in', 'gte', 'lte']) {
    query[method] = vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    });
  }
  // The selector history query is the only mock_exams read that filters out
  // rows without a report; use it to distinguish the previous completed exam
  // from the current in-progress/new one.
  query.not = vi.fn(() => {
    if (table === 'mock_exams') wantsReportedExam = true;
    return query;
  });
  query.insert = vi.fn((payload: Record<string, unknown>) => {
    mocks.state.updates.push({ table, payload, filters: [...filters] });
    if (table === 'mock_exam_answers') {
      mocks.state.answers = [
        ...mocks.state.answers,
        { item_id: String(payload.item_id ?? ''), verdict: String(payload.verdict ?? '') },
      ];
    }
    return query;
  });
  query.update = vi.fn((payload: Record<string, unknown>) => {
    mocks.state.updates.push({ table, payload, filters: [...filters] });
    if (table === 'mock_exams' && mocks.state.exam) {
      mocks.state.exam = { ...mocks.state.exam, ...payload };
    }
    return query;
  });
  const resolveRow = () => {
    if (table === 'mock_exams') {
      return { data: wantsReportedExam ? mocks.state.previousExam : mocks.state.exam, error: null };
    }
    if (table === 'mock_exam_answers') return { data: mocks.state.answers, error: null };
    if (table === 'mock_exam_english_answers' && mocks.state.priorEnglishRequest) {
      return { data: mocks.state.priorEnglishRequest, error: null };
    }
    if (table === 'graded_answers') return { data: mocks.state.gradedAnswers, error: null };
    if (table === 'sessions') {
      return { data: mocks.state.sessionRow ?? mocks.state.sessions, error: null };
    }
    if (table === 'user_settings') return { data: mocks.state.settings, error: null };
    return { data: null, error: null };
  };
  query.maybeSingle = vi.fn(async () => {
    if (table === 'graded_answers') {
      return { data: mocks.state.gradedAnswers[0] ?? null, error: null };
    }
    if (table === 'sessions' && mocks.state.sessionRow) {
      return { data: mocks.state.sessionRow, error: null };
    }
    return resolveRow();
  });
  query.single = vi.fn(async () => resolveRow());
  // Supabase builders are thenable for queries used without .maybeSingle().
  query.then = (onFulfilled: (value: unknown) => unknown) => Promise.resolve(resolveRow()).then(onFulfilled);
  return query;
}

function transcribeEvent(): Parameters<typeof handler>[0] {
  return {
    httpMethod: 'POST',
    path: '/transcript',
    headers: {
      Authorization: 'Bearer test-token',
      'x-correlation-trace-id': 'trace-regression',
    },
    body: JSON.stringify({
      transcript: 'One hundred',
      sessionId: 'session-1',
      currentItemId: FIRST_QUESTION.id,
      examRunId: EXAM_ID,
      simulationMode: 'standard',
      testVersion: '2020',
      inputMethod: 'voice',
    }),
  } as unknown as Parameters<typeof handler>[0];
}

function standardInterviewStartEvent(examAction: 'new' | 'resume'): Parameters<typeof handler>[0] {
  const event = transcribeEvent();
  return {
    ...event,
    body: JSON.stringify({
      sessionStart: true,
      sessionId: 'session-1',
      simulationMode: 'standard',
      testVersion: '2020',
      examAction,
      preferredLanguage: 'en-US',
    }),
  } as unknown as Parameters<typeof handler>[0];
}

function speechSynthesisEvent(overrides: Record<string, unknown> = {}): Parameters<typeof handler>[0] {
  const event = transcribeEvent();
  return {
    ...event,
    body: JSON.stringify({
      speechSynthesis: true,
      speechText: "Today's progress: 8 of 10 correct (80%).",
      simulationMode: 'practice',
      preferredLanguage: 'en-US',
      ...overrides,
    }),
  } as unknown as Parameters<typeof handler>[0];
}

function examReviewEvent(): Parameters<typeof handler>[0] {
  const event = transcribeEvent();
  return {
    ...event,
    body: JSON.stringify({
      examReview: true,
      examId: EXAM_ID,
      preferredLanguage: 'en-US',
    }),
  } as unknown as Parameters<typeof handler>[0];
}

function progressEvent(overrides: Record<string, unknown> = {}): Parameters<typeof handler>[0] {
  const event = transcribeEvent();
  return {
    ...event,
    body: JSON.stringify({
      transcript: 'Can you give me a progress report?',
      sessionId: 'session-1',
      simulationMode: 'practice',
      testVersion: '2020',
      preferredLanguage: 'en-US',
      ...overrides,
    }),
  } as unknown as Parameters<typeof handler>[0];
}

function modeTransitionEvent(
  simulationMode: 'practice' | 'study' | 'standard',
  overrides: Record<string, unknown> = {},
): Parameters<typeof handler>[0] {
  const event = transcribeEvent();
  return {
    ...event,
    body: JSON.stringify({
      modeTransition: true,
      sessionId: 'session-1',
      currentItemId: null,
      simulationMode,
      testVersion: '2020',
      preferredLanguage: 'en-US',
      ...overrides,
    }),
  } as unknown as Parameters<typeof handler>[0];
}

function modeGoalResponseEvent(overrides: Record<string, unknown> = {}): Parameters<typeof handler>[0] {
  const event = transcribeEvent();
  return {
    ...event,
    body: JSON.stringify({
      transcript: 'Geography',
      sessionId: 'session-1',
      currentItemId: null,
      simulationMode: 'practice',
      testVersion: '2020',
      preferredLanguage: 'en-US',
      modeGoalResponse: true,
      ...overrides,
    }),
  } as unknown as Parameters<typeof handler>[0];
}

function bedrockText(text: string) {
  return {
    body: new TextEncoder().encode(JSON.stringify({
      content: [{ type: 'text', text }],
    })),
  };
}

describe('transcript handler — mock exam civics phase routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    mocks.state.exam = examRow();
    mocks.state.previousExam = null;
    mocks.state.priorEnglishRequest = null;
    mocks.state.answers = [];
    mocks.state.gradedAnswers = [];
    mocks.state.sessions = [];
    mocks.state.sessionRow = null;
    mocks.state.settings = null;
    mocks.state.updates = [];
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.from.mockImplementation(makeQuery);
    mocks.createClient.mockImplementation(() => ({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    }));
    // Model failure is fine here: interpret() safe-fails, but only if the turn
    // actually reaches the civics grading path instead of the English handler.
    mocks.bedrockSend.mockRejectedValue(new Error('bedrock unavailable in test'));
    mocks.pollySend.mockResolvedValue({
      AudioStream: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
  });

  it('grades a civics answer when an in-progress exam is still in english_stage=none', async () => {
    const response = await handler(transcribeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { responseText: string; nextItemId: string | null };
    expect(body.responseText.length).toBeGreaterThan(0);
    expect(body.nextItemId).toBe(FIRST_QUESTION.id);
    // The turn must have consulted the exam stage, then fallen through to the
    // normal turn path. Before the fix this returned 500 with
    // "Mock exam is not waiting for an English exercise (stage=none)".
    expect(mocks.from).toHaveBeenCalledWith('mock_exams');
    expect(mocks.from).not.toHaveBeenCalledWith('mock_exam_english_answers');
  });

  it('grades a dynamic civics answer using the authenticated user state', async () => {
    mocks.state.exam = examRow({
      question_ids: ['q-023', 'q-024'],
      current_index: 0,
    });
    mocks.state.settings = { location_state: 'AL' };
    mocks.bedrockSend.mockResolvedValue(bedrockText(JSON.stringify({
      intent: 'answer',
      targetItemId: 'q-023',
      grade: { verdict: 'incorrect', matchedAnswer: null },
      reply: 'Thanks for your answer.',
    })));

    const event = transcribeEvent();
    const request = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
    request.currentItemId = 'q-023';
    request.transcript = 'Katie Britt';
    const response = await handler({ ...event, body: JSON.stringify(request) });

    expect(response.statusCode).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('user_settings');
    expect(mocks.state.updates).toContainEqual(expect.objectContaining({
      table: 'graded_answers',
      payload: expect.objectContaining({ item_id: 'q-023', verdict: 'correct' }),
    }));
  });

  it('appends exactly one dynamically chosen question to the asked list per turn', async () => {
    mocks.state.exam = examRow({
      question_ids: [FIRST_QUESTION.id],
      current_index: 0,
    });
    mocks.bedrockSend.mockResolvedValue(bedrockText(JSON.stringify({
      intent: 'answer',
      targetItemId: FIRST_QUESTION.id,
      grade: { verdict: 'correct', matchedAnswer: 'Republic' },
      reply: 'That is correct.',
    })));

    const event = transcribeEvent();
    const request = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
    request.transcript = 'Republic';
    const response = await handler({ ...event, body: JSON.stringify(request) });

    expect(response.statusCode).toBe(200);
    const update = mocks.state.updates.find(
      entry => entry.table === 'mock_exams'
        && Array.isArray(entry.payload.question_ids)
        && entry.payload.current_index === 1,
    );
    expect(update).toBeDefined();
    const questionIds = update?.payload.question_ids as string[];
    expect(questionIds).toHaveLength(2);
    expect(questionIds[0]).toBe(FIRST_QUESTION.id);
    expect(questionIds[1]).not.toBe(FIRST_QUESTION.id);
  });

  it('starts English reading only after the civics pass threshold is reached', async () => {
    const readingPromptIds = pickEnglishExercisePrompts('reading');
    mocks.state.exam = examRow({
      question_ids: [FIRST_QUESTION.id],
      current_index: 0,
      correct_count: 11,
      incorrect_count: 0,
      include_english_simulation: true,
      reading_prompt_ids: readingPromptIds,
    });
    mocks.bedrockSend.mockResolvedValue(bedrockText(JSON.stringify({
      intent: 'answer',
      targetItemId: FIRST_QUESTION.id,
      grade: { verdict: 'correct', matchedAnswer: 'Republic' },
      reply: 'That is correct.',
    })));

    const event = transcribeEvent();
    const request = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
    request.transcript = 'Republic';
    const response = await handler({ ...event, body: JSON.stringify(request) });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      examCompleted: boolean;
      examStage: string | null;
      nextQuestion: string | null;
    };
    expect(body.examCompleted).toBe(false);
    expect(body.examStage).toBe('reading');
    expect(body.nextQuestion).toBeTruthy();
    expect(mocks.state.updates).toContainEqual(expect.objectContaining({
      table: 'mock_exams',
      payload: expect.objectContaining({ english_stage: 'reading' }),
    }));
  });

  it('does not administer English when civics ends at the fail threshold', async () => {
    const readingPromptIds = pickEnglishExercisePrompts('reading');
    mocks.state.exam = examRow({
      question_ids: [FIRST_QUESTION.id],
      current_index: 0,
      correct_count: 0,
      incorrect_count: 8,
      include_english_simulation: true,
      reading_prompt_ids: readingPromptIds,
    });
    mocks.bedrockSend.mockResolvedValue(bedrockText(JSON.stringify({
      intent: 'answer',
      targetItemId: FIRST_QUESTION.id,
      grade: { verdict: 'incorrect', matchedAnswer: null },
      reply: 'Thanks for trying.',
    })));

    const event = transcribeEvent();
    const request = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
    request.transcript = 'I am not sure';
    const response = await handler({ ...event, body: JSON.stringify(request) });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      examCompleted: boolean;
      examReviewId: string | null;
      nextItemId: string | null;
      assistantSegments: string[];
    };
    expect(body.examCompleted).toBe(true);
    expect(body.examReviewId).toBe(EXAM_ID);
    expect(body.nextItemId).toBeNull();
    expect(body.assistantSegments.join(' ')).not.toMatch(/English reading/i);
    expect(mocks.state.updates).not.toContainEqual(expect.objectContaining({
      table: 'mock_exams',
      payload: expect.objectContaining({ english_stage: 'reading' }),
    }));
  });

  it('still routes to the English exercise path while the exam is in stage=reading', async () => {
    const readingPromptId = pickEnglishExercisePrompts('reading')[0];
    mocks.state.exam = examRow({
      english_stage: 'reading',
      reading_prompt_ids: [readingPromptId],
      include_english_simulation: true,
    });
    // A prior submission for this request id short-circuits the handler with
    // the cached feedback + the current prompt (idempotent retry path).
    mocks.state.priorEnglishRequest = { section: 'reading', feedback: 'Nice reading.' };

    const response = await handler(transcribeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      responseText: string;
      examStage: string | null;
      nextQuestion: string | null;
    };
    expect(body.examStage).toBe('reading');
    expect(body.responseText).toContain('Nice reading.');
    expect(body.nextQuestion).toBeTruthy();
    expect(mocks.from).toHaveBeenCalledWith('mock_exam_english_answers');
  });

  it.each(['new', 'resume'] as const)(
    'shows the first-time rules card and waits for Ready for the %s action',
    async (examAction) => {
      const response = await handler(standardInterviewStartEvent(examAction));

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        responseText: string;
        audioData: string;
        assistantSegments: string[];
        nextItemId: string | null;
        examIntro: { kind: string; icebreaker: string; facts: string; readyPrompt: string } | null;
      };
      expect(body.examIntro?.kind).toBe('first-time');
      expect(body.responseText).toContain('up to 20 civics questions');
      expect(body.responseText).toContain('You pass with 12 correct answers');
      expect(body.responseText).toContain('ends early at 12 correct or 9 incorrect');
      expect(body.responseText).toContain('nine USCIS civics topics');
      expect(body.responseText).toContain('When you are ready, choose Ready.');
      expect(body.responseText).not.toContain(FIRST_QUESTION.question);
      expect(body.nextItemId).toBeNull();
      expect(body.assistantSegments).toHaveLength(2);
      expect(body.assistantSegments[0]).toContain(body.examIntro?.icebreaker ?? '');
      expect(body.assistantSegments[0]).toContain('up to 20 civics questions');
      expect(body.assistantSegments[0]).toContain('nine USCIS civics topics');
      expect(body.assistantSegments[1]).toContain('When you are ready, choose Ready.');
      expect(body.audioData).toBe('');
      expect(mocks.pollySend).not.toHaveBeenCalled();
    }
  );

  it('uses a deterministic, digit-free icebreaker when the model is unavailable', async () => {
    const response = await handler(standardInterviewStartEvent('new'));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      examIntro: { kind: string; icebreaker: string } | null;
    };
    expect(body.examIntro?.icebreaker).toBe(
      "I'm glad you're here. Let's get comfortable and begin your practice interview."
    );
    expect(body.examIntro?.icebreaker).not.toMatch(/\d/);
  });

  it('summarises the last completed interview before asking for Ready', async () => {
    mocks.state.previousExam = examRow({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'completed',
      correct_count: 14,
      incorrect_count: 3,
      question_ids: allItems('2020').slice(0, 17).map(item => item.id),
      report_markdown: '17 civics answers were graded.',
    });

    const response = await handler(standardInterviewStartEvent('new'));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      responseText: string;
      nextItemId: string | null;
      examIntro: { kind: string; facts: string } | null;
    };
    expect(body.examIntro?.kind).toBe('returning');
    expect(body.responseText).toContain('Last time you answered 14 correctly and 3 incorrectly (17 graded answers).');
    expect(body.responseText).toContain('You passed that practice interview.');
    expect(body.responseText).toContain('It ended early when a pass or fail threshold was reached.');
    expect(body.responseText).toContain('When you are ready, choose Ready.');
    expect(body.responseText).not.toContain('up to 20 civics questions');
    expect(body.nextItemId).toBeNull();
  });

  it('resumes a mid-interview attempt at its current question', async () => {
    const items = allItems('2020');
    mocks.state.exam = examRow({
      question_ids: [items[0].id, items[1].id],
      current_index: 1,
      correct_count: 2,
      incorrect_count: 1,
    });

    const response = await handler(standardInterviewStartEvent('resume'));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      responseText: string;
      nextItemId: string | null;
      examIntro: { kind: string } | null;
    };
    expect(body.examIntro?.kind).toBe('resume');
    expect(body.responseText).toContain('You have answered 3 questions: 2 correct and 1 incorrect.');
    expect(body.nextItemId).toBe(items[1].id);
    expect(body.responseText).toContain(items[1].question);
  });

  it('asks the first question only after the Ready action', async () => {
    const response = await handler({
      ...transcribeEvent(),
      body: JSON.stringify({
        transcript: 'Ready',
        openingResponse: true,
        sessionId: 'session-1',
        simulationMode: 'standard',
        testVersion: '2020',
        examRunId: EXAM_ID,
        preferredLanguage: 'en-US',
      }),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      responseText: string;
      assistantSegments: string[];
      nextItemId: string | null;
    };
    expect(body.responseText).toBe(FIRST_QUESTION.question);
    expect(body.assistantSegments).toEqual([FIRST_QUESTION.question]);
    expect(body.nextItemId).toBe(FIRST_QUESTION.id);
    expect(mocks.bedrockSend).not.toHaveBeenCalled();
  });

  it('closes every previously unfinished Standard Interview when a new one starts', async () => {
    const response = await handler(standardInterviewStartEvent('new'));

    expect(response.statusCode).toBe(200);
    const closed = mocks.state.updates.filter(
      update => update.table === 'mock_exams' && update.payload.status === 'completed',
    );
    expect(closed).toHaveLength(1);
    expect(closed[0].payload.completed_at).toEqual(expect.any(String));
    expect(mocks.state.updates.some(update => update.payload.status === 'abandoned')).toBe(false);
  });

  it('announces completion and sends one warm summary bubble without a question review', async () => {
    mocks.state.exam = examRow({
      question_ids: [FIRST_QUESTION.id],
      current_index: 0,
      correct_count: 3,
      incorrect_count: 8,
    });
    mocks.state.answers = [{ item_id: FIRST_QUESTION.id, verdict: 'incorrect' }];
    let bedrockCalls = 0;
    mocks.bedrockSend.mockImplementation(async () => {
      bedrockCalls += 1;
      if (bedrockCalls === 1) {
        return bedrockText(JSON.stringify({
          intent: 'answer',
          targetItemId: null,
          grade: { verdict: 'incorrect', matchedAnswer: null },
          reply: 'Thanks for giving that a try.',
        }));
      }
      throw new Error('summary model unavailable in test');
    });

    const response = await handler(transcribeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      responseText: string;
      assistantSegments: string[];
      examCompleted: boolean;
      examReviewId: string | null;
    };
    expect(body.examCompleted).toBe(true);
    expect(body.examReviewId).toBe(EXAM_ID);
    expect(body.assistantSegments).toHaveLength(2);
    expect(body.assistantSegments[0]).toMatch(/completes your Standard Interview/i);
    expect(body.assistantSegments[1]).toContain('Practice Mode');
    expect(body.assistantSegments[1]).toContain('Interview Report');
    expect(body.assistantSegments[1]).toMatch(/decision/i);
    expect(body.assistantSegments[1]).toMatch(/goals/i);
    expect(body.responseText).not.toMatch(/questions to review/i);
  });

  it('reports Standard Interview progress as answered and remaining questions', async () => {
    mocks.state.exam = examRow({
      question_ids: allItems('2020').slice(0, 10).map(item => item.id),
      current_index: 4,
      correct_count: 3,
      incorrect_count: 1,
    });

    const response = await handler(progressEvent({
      simulationMode: 'standard',
      currentItemId: FIRST_QUESTION.id,
      examRunId: EXAM_ID,
    }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { responseText: string };
    expect(body.responseText).toContain('4 questions into your 20-question Standard Interview');
    expect(body.responseText).toContain('16 still ahead');
    expect(body.responseText).toMatch(/continue/i);
    expect(body.responseText).not.toMatch(/pass|fail/i);
  });

  it('reports Practice progress with today, accuracy, milestone, and weekly goal facts', async () => {
    mocks.state.gradedAnswers = [
      { verdict: 'correct' },
      { verdict: 'correct' },
      { verdict: 'correct' },
      { verdict: 'incorrect' },
      { verdict: 'incorrect' },
    ];
    mocks.state.sessions = [{ id: 'session-1', local_date: '2026-11-04' }];
    mocks.state.settings = { weekly_graded_answer_target: 20, account_timezone: 'UTC' };

    const response = await handler(progressEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { responseText: string };
    expect(body.responseText).toContain('5 practice questions');
    expect(body.responseText).toContain('3 right');
    expect(body.responseText).toContain('60%');
    expect(body.responseText).toContain('next ten-answer milestone');
    expect(body.responseText).toContain('20');
    expect(body.responseText).toMatch(/continue/i);
  });

  it('reports Study progress as the current position in the sequential bank', async () => {
    const response = await handler(progressEvent({
      simulationMode: 'study',
      currentItemId: STUDY_ITEM.id,
    }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { responseText: string };
    expect(body.responseText).toContain('question 10 of 128');
    expect(body.responseText).toContain('118 questions ahead');
    expect(body.responseText).toContain(getStudyCategoryTitle(STUDY_ITEM));
    expect(body.responseText).toMatch(/continue/i);
  });

  it('returns a factual scorecard and question outcomes with the generated interview review', async () => {
    const items = allItems('2020').slice(0, 12);
    mocks.state.exam = examRow({
      status: 'completed',
      correct_count: 12,
      incorrect_count: 0,
      include_english_simulation: true,
      reading_passed: true,
      writing_passed: false,
      report_markdown: '12 civics answers were correct.',
    });
    mocks.state.answers = items.map(item => ({ item_id: item.id, verdict: 'correct' }));

    const response = await handler(examReviewEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      scorecard: {
        testVersion: string;
        civics: { correct: number; incorrect: number; total: number; accuracyPercent: number };
        english: { included: boolean; readingPassed: boolean | null; writingPassed: boolean | null };
      };
      questionOutcomes: Array<{
        question: string;
        verdict: string;
        acceptableAnswers: string[] | null;
      }>;
      suggestedFocus: Array<{ id: string; label: string }>;
    };
    expect(body.scorecard).toEqual({
      testVersion: '2020',
      civics: { correct: 12, incorrect: 0, total: 12, accuracyPercent: 100 },
      english: { included: true, readingPassed: true, writingPassed: false },
    });
    expect(body.questionOutcomes).toHaveLength(12);
    expect(body.questionOutcomes[0]).toEqual({
      question: items[0].question,
      verdict: 'correct',
      acceptableAnswers: items[0].kind === 'static' ? items[0].acceptableAnswers : null,
    });
    expect(body.suggestedFocus).toEqual([]);
  });

  it('suggests the weakest civics categories in the interview review', async () => {
    mocks.state.exam = examRow({
      status: 'completed',
      correct_count: 4,
      incorrect_count: 5,
      report_markdown: 'Nine civics answers were graded.',
    });
    // Hit one category twice and another once so accuracy, then volume,
    // decides the order.
    mocks.state.answers = [
      { item_id: 'q-001', verdict: 'incorrect' },
      { item_id: 'q-002', verdict: 'incorrect' },
      { item_id: 'q-063', verdict: 'incorrect' },
      { item_id: 'q-064', verdict: 'correct' },
    ];

    const response = await handler(examReviewEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      suggestedFocus: Array<{ id: string; label: string }>;
    };
    expect(body.suggestedFocus.map(entry => entry.id).slice(0, 2)).toEqual([
      'principles-of-american-democracy',
      'rights-and-responsibilities',
    ]);
  });

  it('reports English as not administered when civics ends at the fail threshold', async () => {
    const items = allItems('2020').slice(0, 9);
    mocks.state.exam = examRow({
      status: 'completed',
      correct_count: 0,
      incorrect_count: 9,
      include_english_simulation: true,
      reading_passed: null,
      writing_passed: null,
      report_markdown: 'Civics ended at the fail threshold.',
    });
    mocks.state.answers = items.map(item => ({ item_id: item.id, verdict: 'incorrect' }));

    const response = await handler(examReviewEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      scorecard: {
        civics: { correct: number; incorrect: number; total: number; accuracyPercent: number };
        english: { included: boolean; readingPassed: boolean | null; writingPassed: boolean | null };
      };
    };
    expect(body.scorecard.english).toEqual({
      included: true,
      readingPassed: null,
      writingPassed: null,
    });
  });

  it('synthesizes a validated speech-only progress summary without invoking grading or Bedrock', async () => {
    const response = await handler(speechSynthesisEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { responseText: string; audioData: string };
    expect(body.responseText).toBe("Today's progress: 8 of 10 correct (80%).");
    expect(body.audioData).toBeTruthy();
    expect(mocks.pollySend).toHaveBeenCalled();
    expect(mocks.bedrockSend).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects speech-only summaries that exceed the input limit', async () => {
    const response = await handler(speechSynthesisEvent({ speechText: 'x'.repeat(501) }));

    expect(response.statusCode).toBe(400);
    expect(mocks.pollySend).not.toHaveBeenCalled();
  });

  it('requires valid bearer authentication before speech synthesis', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } });

    const response = await handler(speechSynthesisEvent());

    expect(response.statusCode).toBe(401);
    expect(mocks.pollySend).not.toHaveBeenCalled();
  });

  it('returns a server failure when Polly cannot synthesize a speech-only summary', async () => {
    mocks.pollySend.mockRejectedValue(new Error('Polly unavailable'));

    const response = await handler(speechSynthesisEvent());

    expect(response.statusCode).toBe(500);
  });

  it('integrates ApiClient speech requests with the authenticated transcript handler', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('Authorization') ?? '';
      const response = await handler({
        ...transcribeEvent(),
        headers: {
          Authorization: authorization,
          'x-correlation-trace-id': 'trace-integration',
        },
        body: String(init?.body ?? ''),
      });
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers ?? {})) {
        responseHeaders.set(name, String(value));
      }
      return new Response(response.body, {
        status: response.statusCode,
        headers: responseHeaders,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const audio = await new ApiClient('token', 'https://api.example.test').synthesizeSpeechText(
      "Today's progress: 8 of 10 correct (80%).",
      { simulationMode: 'practice', preferredLanguage: 'en-US' }
    );

    expect(new Uint8Array(audio)).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.pollySend).toHaveBeenCalledOnce();
    expect(mocks.bedrockSend).not.toHaveBeenCalled();
  });

  it('starts first-time Practice onboarding with the account goal and no first question', async () => {
    mocks.state.sessionRow = {
      id: 'session-1',
      current_goal: null,
      mode_goal_pending: false,
      current_item_id: null,
    };
    mocks.state.settings = { learning_goal: 'Symbols' };

    const response = await handler(modeTransitionEvent('practice'));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      responseText: string;
      audioData: string;
      nextItemId: string | null;
      modeGoalPending: boolean;
    };
    expect(body.responseText).toContain('Practice Mode is ready');
    expect(body.responseText).toContain('Choose one focus area');
    expect(body.audioData).toBe('');
    expect(body.nextItemId).toBeNull();
    expect(body.modeGoalPending).toBe(true);
    expect(mocks.pollySend).not.toHaveBeenCalled();
    expect(mocks.state.updates).toContainEqual(expect.objectContaining({
      table: 'sessions',
      payload: expect.objectContaining({
        mode_goal_pending: true,
        current_goal: 'Symbols',
      }),
    }));
  });

  it('shows returning Practice counts from prior graded answers before the focus card', async () => {
    const item = allItems('2020')[0];
    mocks.state.sessionRow = {
      id: 'session-1',
      current_goal: 'All focus areas',
      mode_goal_pending: false,
      current_item_id: null,
    };
    mocks.state.gradedAnswers = [
      { item_id: item.id, verdict: 'correct' },
      { item_id: item.id, verdict: 'correct' },
      { item_id: item.id, verdict: 'correct' },
      { item_id: item.id, verdict: 'correct' },
    ];

    const response = await handler(modeTransitionEvent('practice'));

    const body = JSON.parse(response.body) as {
      responseText: string;
      nextItemId: string | null;
      modeGoalPending: boolean;
    };
    expect(body.responseText).toContain('Practice Mode is ready');
    expect(body.responseText).toContain('Across the 2020 question bank');
    expect(body.responseText).toContain('questions are mastered');
    expect(body.responseText).toContain('You are currently covering All focus areas');
    expect(body.nextItemId).toBeNull();
    expect(body.modeGoalPending).toBe(true);
  });

  it('continues with the stored focus when the intro bubble confirms it without text', async () => {
    mocks.state.sessionRow = {
      id: 'session-1',
      current_goal: 'Geography',
      mode_goal_pending: true,
      current_item_id: null,
    };

    const response = await handler(modeGoalResponseEvent({
      transcript: '',
      confirmFocus: true,
    }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      responseText: string;
      nextItemId: string | null;
      modeGoalPending: boolean;
    };
    const geography = focusedItems('2020', ['geography']).map(entry => entry.id);
    expect(body.responseText).toContain('Great. We will use Geography in Practice Mode.');
    expect(geography).toContain(body.nextItemId);
    expect(body.modeGoalPending).toBe(false);
    expect(mocks.state.updates).toContainEqual(expect.objectContaining({
      table: 'sessions',
      payload: expect.objectContaining({
        current_goal: 'Geography',
        mode_goal_pending: false,
      }),
    }));
  });

  it('starts the first focused Practice question only after the focus submission', async () => {
    mocks.state.sessionRow = {
      id: 'session-1',
      current_goal: 'All focus areas',
      mode_goal_pending: true,
      current_item_id: null,
    };

    const response = await handler(modeGoalResponseEvent({
      focusAreaIds: ['geography'],
      allFocusAreas: false,
    }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      responseText: string;
      nextItemId: string | null;
      modeGoalPending: boolean;
    };
    const geography = focusedItems('2020', ['geography']).map(entry => entry.id);
    expect(body.responseText).toContain('Great. We will use Geography in Practice Mode.');
    expect(body.nextItemId).not.toBeNull();
    expect(geography).toContain(body.nextItemId);
    expect(body.modeGoalPending).toBe(false);
    expect(mocks.state.updates).toContainEqual(expect.objectContaining({
      table: 'sessions',
      payload: expect.objectContaining({
        current_goal: 'Geography',
        mode_goal_pending: false,
      }),
    }));
  });

  it('announces a new focus pass after every item was asked once', async () => {
    const pool = focusedItems('2020', ['geography']);
    mocks.state.sessionRow = {
      id: 'session-1',
      current_goal: 'Geography',
      mode_goal_pending: true,
      current_item_id: null,
    };
    mocks.state.gradedAnswers = pool.map(item => ({ item_id: item.id, verdict: 'correct' }));

    const response = await handler(modeGoalResponseEvent({
      focusAreaIds: ['geography'],
      allFocusAreas: false,
    }));

    const body = JSON.parse(response.body) as { responseText: string; nextItemId: string | null };
    expect(body.responseText).toContain('You have completed a full pass through this focus');
    expect(pool.map(item => item.id)).toContain(body.nextItemId);
  });

  it('normalises 2008 category aliases before persisting the focus', async () => {
    mocks.state.sessionRow = {
      id: 'session-1',
      current_goal: 'All focus areas',
      mode_goal_pending: true,
      current_item_id: null,
    };

    const response = await handler(modeGoalResponseEvent({
      simulationMode: 'study',
      testVersion: '2008',
      focusAreaIds: ['the-1800s'],
      allFocusAreas: false,
    }));

    const body = JSON.parse(response.body) as { nextItemId: string | null };
    const selected = allItems('2008').find(item => item.id === body.nextItemId);
    expect(normalizeFocusCategoryId(selected?.studyCategoryId)).toBe('1800s');
    expect(mocks.state.updates).toContainEqual(expect.objectContaining({
      table: 'sessions',
      payload: expect.objectContaining({
        current_goal: 'The 1800s',
        mode_goal_pending: false,
      }),
    }));
  });

  it('rejects more than three focus categories', async () => {
    const response = await handler(modeGoalResponseEvent({
      focusAreaIds: ['geography', 'symbols', 'holidays', '1800s'],
      allFocusAreas: false,
    }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toContain('Invalid focus area selection');
  });
});
