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

describe('transcript handler — mock exam civics phase routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    mocks.state.exam = examRow();
    mocks.state.priorEnglishRequest = null;
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
});
