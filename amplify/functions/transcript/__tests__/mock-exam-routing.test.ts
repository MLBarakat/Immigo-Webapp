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
    priorEnglishRequest: null as Record<string, unknown> | null,
    answers: [] as Array<{ item_id: string; verdict: string }>,
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
import { getFirstQuestion } from '../turn/bank';
import { pickEnglishExercisePrompts } from '../english-exercises';
import { ApiClient } from '../../../../src/services/apiClient';

const FIRST_QUESTION = getFirstQuestion('2020');
const EXAM_ID = '11111111-1111-4111-8111-111111111111';

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
  for (const method of ['select', 'eq', 'neq', 'order', 'limit', 'insert', 'update']) {
    query[method] = vi.fn(() => query);
  }
  const resolveRow = () => {
    if (table === 'mock_exams') return { data: mocks.state.exam, error: null };
    if (table === 'mock_exam_answers') return { data: mocks.state.answers, error: null };
    if (table === 'mock_exam_english_answers' && mocks.state.priorEnglishRequest) {
      return { data: mocks.state.priorEnglishRequest, error: null };
    }
    return { data: null, error: null };
  };
  query.maybeSingle = vi.fn(async () => resolveRow());
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

describe('transcript handler — mock exam civics phase routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    mocks.state.exam = examRow();
    mocks.state.priorEnglishRequest = null;
    mocks.state.answers = [];
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
    'returns an immediate text-only Standard Interview response for the %s action',
    async (examAction) => {
      const response = await handler(standardInterviewStartEvent(examAction));

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        responseText: string;
        audioData: string;
        assistantSegments: string[];
        nextItemId: string | null;
      };
      expect(body.responseText).toContain(FIRST_QUESTION.question);
      expect(body.responseText).toContain(
        examAction === 'new'
          ? "Let's begin your Standard Interview."
          : "Let's continue your Standard Interview from where you left off."
      );
      expect(body.audioData).toBe('');
      expect(body.assistantSegments).toEqual([body.responseText]);
      expect(body.nextItemId).toBe(FIRST_QUESTION.id);
      expect(mocks.pollySend).not.toHaveBeenCalled();
    }
  );

  it('returns a factual scorecard and question outcomes with the generated interview review', async () => {
    mocks.state.exam = examRow({
      status: 'completed',
      correct_count: 1,
      incorrect_count: 0,
      include_english_simulation: true,
      reading_passed: true,
      writing_passed: false,
      report_markdown: '1 civics answer was correct.',
    });
    mocks.state.answers = [{ item_id: FIRST_QUESTION.id, verdict: 'correct' }];

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
    };
    expect(body.scorecard).toEqual({
      testVersion: '2020',
      civics: { correct: 1, incorrect: 0, total: 1, accuracyPercent: 100 },
      english: { included: true, readingPassed: true, writingPassed: false },
    });
    expect(body.questionOutcomes).toEqual([{
      question: FIRST_QUESTION.question,
      verdict: 'correct',
      acceptableAnswers: FIRST_QUESTION.kind === 'static' ? FIRST_QUESTION.acceptableAnswers : null,
    }]);
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
});
