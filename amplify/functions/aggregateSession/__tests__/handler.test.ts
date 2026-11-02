// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const from = vi.fn();
  const send = vi.fn();
  const createClient = vi.fn(() => ({ auth: { getUser }, from }));
  const InvokeModelCommand = vi.fn((input: unknown) => ({ input }));
  const BedrockRuntimeClient = vi.fn(() => ({ send }));
  return { getUser, from, send, createClient, InvokeModelCommand, BedrockRuntimeClient };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: mocks.BedrockRuntimeClient,
  InvokeModelCommand: mocks.InvokeModelCommand,
}));

const REQUIRED_ENV = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon-key',
  AWS_DEFAULT_REGION: 'us-east-2',
};

function setEnv(): void {
  Object.assign(process.env, REQUIRED_ENV);
}

async function loadHandler() {
  vi.resetModules();
  setEnv();
  const module = await import('../handler');
  return module.handler;
}

interface QueryResult {
  data?: unknown;
  error?: { message: string } | null;
}

function makeBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'lt', 'order', 'limit', 'upsert']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function installTables(tables: Record<string, ReturnType<typeof makeBuilder>>): void {
  mocks.from.mockImplementation((table: string) => tables[table] ?? makeBuilder({ data: null, error: null }));
}

function makeEvent(body: string | null, headers: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    headers,
    body,
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/complete-session',
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/complete-session',
  };
}

function bodyOf(result: { body: string }): Record<string, unknown> {
  return JSON.parse(result.body) as Record<string, unknown>;
}

function bedrockText(callIndex: number): string {
  const command = mocks.send.mock.calls[callIndex]?.[0] as { input?: { body?: string } } | undefined;
  const payload = JSON.parse(command?.input?.body ?? '{}') as {
    messages?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return payload.messages?.[0]?.content?.[0]?.text ?? '';
}

function bedrockSystemPrompt(callIndex: number): string {
  const command = mocks.send.mock.calls[callIndex]?.[0] as { input?: { body?: string } } | undefined;
  const payload = JSON.parse(command?.input?.body ?? '{}') as { system?: string };
  return payload.system ?? '';
}

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.send.mockReset();
  mocks.createClient.mockClear();
  mocks.InvokeModelCommand.mockClear();
  mocks.BedrockRuntimeClient.mockClear();
});

describe('aggregateSession handler contract', () => {
  it('returns 401 when the bearer token is missing', async () => {
    const handler = await loadHandler();
    const result = await handler(makeEvent(JSON.stringify({ sessionId: 'session-1' })));

    expect(result.statusCode).toBe(401);
    expect(bodyOf(result).error).toMatch(/missing token/i);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase rejects the token', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const handler = await loadHandler();

    const result = await handler(
      makeEvent(JSON.stringify({ sessionId: 'session-1' }), { authorization: 'Bearer bad-token' }),
    );

    expect(result.statusCode).toBe(401);
    expect(bodyOf(result).error).toMatch(/invalid token/i);
  });

  it('returns 400 for a missing body, invalid JSON, and an invalid sessionId', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const handler = await loadHandler();
    const headers = { authorization: 'Bearer good-token' };

    const missing = await handler(makeEvent(null, headers));
    const invalidJson = await handler(makeEvent('{not-json', headers));
    const invalidId = await handler(makeEvent(JSON.stringify({ sessionId: '../etc/passwd' }), headers));

    expect(missing.statusCode).toBe(400);
    expect(bodyOf(missing).error).toMatch(/missing request body/i);
    expect(invalidJson.statusCode).toBe(400);
    expect(bodyOf(invalidJson).error).toMatch(/invalid json/i);
    expect(invalidId.statusCode).toBe(400);
    expect(bodyOf(invalidId).error).toMatch(/invalid or malformed sessionid/i);
  });

  it('returns an empty report without calling Bedrock when the session has no data', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    installTables({
      sessions: makeBuilder({ data: { local_date: '2026-10-31' }, error: null }),
      messages: makeBuilder({ data: [], error: null }),
      daily_progress_reports: makeBuilder({ data: null, error: null }),
      graded_answers: makeBuilder({ data: [], error: null }),
    });
    const handler = await loadHandler();

    const result = await handler(
      makeEvent(JSON.stringify({ sessionId: 'session-1' }), { authorization: 'Bearer good-token' }),
    );

    expect(result.statusCode).toBe(200);
    expect(bodyOf(result)).toMatchObject({
      success: true,
      date: '2026-10-31',
      reportMarkdown: '',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('generates a report from authoritative verdicts and upserts it', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const reportTable = makeBuilder({
      data: {
        report_markdown: [
          '## What Went Well',
          'Your explanations were clear and specific.',
          '',
          '## Recorded Civics Results',
          '- Questions graded: 8',
          '- Accuracy: 75%',
          '',
          '## What to Practice Next',
          'Review the branches of government.',
        ].join('\n'),
      },
      error: null,
    });
    installTables({
      sessions: makeBuilder({ data: { local_date: '2026-10-31' }, error: null }),
      messages: makeBuilder({
        data: [
          { role: 'user', content: 'The President is elected for four years.', created_at: '2026-10-31T10:00:00Z' },
          { role: 'assistant', content: 'Correct.', created_at: '2026-10-31T10:00:01Z' },
        ],
        error: null,
      }),
      daily_progress_reports: reportTable,
      graded_answers: makeBuilder({
        data: [
          { item_id: 'q-1', verdict: 'correct', simulation_mode: 'standard', test_version: '2020' },
          { item_id: 'q-2', verdict: 'partial', simulation_mode: 'practice', test_version: '2020' },
        ],
        error: null,
      }),
    });
    mocks.send
      .mockResolvedValueOnce({
        body: Buffer.from(JSON.stringify({ content: [{ type: 'text', text: '# Daily Report' }] })),
      })
      .mockResolvedValueOnce({
        body: Buffer.from(JSON.stringify({ embedding: [0.1, 0.2, 0.3] })),
      });

    const handler = await loadHandler();
    const result = await handler(
      makeEvent(JSON.stringify({ sessionId: 'session-1' }), { authorization: 'Bearer good-token' }),
    );

    expect(result.statusCode).toBe(200);
    const body = bodyOf(result);
    expect(body.success).toBe(true);
    expect(body.date).toBe('2026-10-31');
    expect(body.reportMarkdown).toContain('# Daily Report');
    expect(body.reportMarkdown).toContain('## Recorded Civics Results');
    expect(body.reportMarkdown).toContain('Questions graded: 2');
    expect(body.reportMarkdown).toContain('Accuracy: 50%');
    expect(body.reportMarkdown).toContain('not affiliated with or endorsed by USCIS');

    const prompt = bedrockText(0);
    expect(prompt).toContain('account-local calendar date');
    expect(prompt).not.toContain('UTC Daily Progress Report');
    expect(prompt).not.toContain('Questions graded today: 2');
    expect(prompt).toContain('Your explanations were clear and specific.');
    expect(prompt).not.toContain('Recorded Civics Results');
    expect(prompt).not.toContain('Questions graded: 8');
    expect(prompt).not.toContain('75%');
    expect(bedrockSystemPrompt(0)).not.toContain('Category Breakdown & Scores');
    expect(bedrockSystemPrompt(0)).not.toContain('85/100');

    expect(reportTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        date: '2026-10-31',
        report_markdown: expect.stringContaining('# Daily Report'),
        embedding: [0.1, 0.2, 0.3],
      }),
      { onConflict: 'user_id,date' },
    );
  });

  it('rejects model-generated category scores without storing them', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const reportTable = makeBuilder({ data: null, error: null });
    installTables({
      sessions: makeBuilder({ data: { local_date: '2026-10-31' }, error: null }),
      messages: makeBuilder({
        data: [{ role: 'user', content: 'The President is elected for four years.', created_at: '2026-10-31T10:00:00Z' }],
        error: null,
      }),
      daily_progress_reports: reportTable,
      graded_answers: makeBuilder({
        data: [{ item_id: 'q-1', verdict: 'correct', simulation_mode: 'standard', test_version: '2020' }],
        error: null,
      }),
    });
    mocks.send.mockResolvedValueOnce({
      body: Buffer.from(JSON.stringify({
        content: [{ type: 'text', text: '# Daily Report\n\n## Category Breakdown & Scores\nAmerican Government: 85/100' }],
      })),
    }).mockResolvedValueOnce({
      body: Buffer.from(JSON.stringify({ embedding: [0.1, 0.2, 0.3] })),
    });

    const handler = await loadHandler();
    const result = await handler(
      makeEvent(JSON.stringify({ sessionId: 'session-1' }), { authorization: 'Bearer eval-token' }),
    );

    expect(result.statusCode).toBe(500);
    expect(bodyOf(result).error).toMatch(/unverified numeric content/i);
    expect(reportTable.upsert).not.toHaveBeenCalled();
  });

  it('returns 500 when Bedrock returns an empty report', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    installTables({
      sessions: makeBuilder({ data: { local_date: '2026-10-31' }, error: null }),
      messages: makeBuilder({
        data: [{ role: 'user', content: 'Hello', created_at: '2026-10-31T10:00:00Z' }],
        error: null,
      }),
      daily_progress_reports: makeBuilder({ data: null, error: null }),
      graded_answers: makeBuilder({ data: [], error: null }),
    });
    mocks.send.mockResolvedValueOnce({
      body: Buffer.from(JSON.stringify({ content: [] })),
    });

    const handler = await loadHandler();
    const result = await handler(
      makeEvent(JSON.stringify({ sessionId: 'session-1' }), { authorization: 'Bearer good-token' }),
    );

    expect(result.statusCode).toBe(500);
    expect(bodyOf(result).error).toMatch(/empty report text/i);
  });
});
