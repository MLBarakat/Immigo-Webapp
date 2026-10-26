import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../apiClient';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../logger', () => ({ logger: loggerMock }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApiClient active route contracts', () => {
  it('transmits English exercise modality and idempotency key and parses the active exam stage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      responseText: 'English writing, sentence one.',
      audioData: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: null,
      nextQuestion: 'The President lives in the White House.',
      examRunId: 'exam-1',
      examStage: 'writing',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ApiClient('token', 'https://api.example.test').postTranscript(
      'The President lives in the White House.',
      [],
      'session-1',
      null,
      { simulationMode: 'standard', examRunId: 'exam-1', inputMethod: 'text', requestId: 'request-1' },
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      examRunId: 'exam-1', inputMethod: 'text', requestId: 'request-1',
    });
    expect(result.examStage).toBe('writing');
    expect(result.examRunId).toBe('exam-1');
  });

  it('sends the selected simulation mode and language for transcript turns', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      responseText: 'Next question',
      audioData: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: 'q-2',
      nextQuestion: 'Question two?',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new ApiClient('token', 'https://api.example.test').postTranscript(
      'Answer',
      [],
      'session-1',
      'q-1',
      false,
      { simulationMode: 'study', preferredLanguage: 'es-ES', openingResponse: true }
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      simulationMode: 'study',
      preferredLanguage: 'es-ES',
      openingResponse: true,
    });
  });

  it('passes an abort signal through to transcript requests for interruptions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      responseText: 'Next question',
      audioData: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: null,
      nextQuestion: null,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await new ApiClient('token', 'https://api.example.test').postTranscript(
      'Please interrupt',
      [],
      null,
      null,
      { signal: controller.signal }
    );

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBe(controller.signal);
  });

  it('sends the selected simulation mode and language for session starts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      responseText: 'First question',
      audioData: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: 'q-1',
      nextQuestion: 'Question one?',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new ApiClient('token', 'https://api.example.test').postSessionStart(
      'session-1',
      { simulationMode: 'practice', preferredLanguage: 'fr-FR' }
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      sessionStart: true,
      simulationMode: 'practice',
      preferredLanguage: 'fr-FR',
    });
  });

  it('accepts a silent session start that only selects the first question', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      responseText: '',
      audioData: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: 'q-1',
      nextQuestion: 'Question one?',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ApiClient('token', 'https://api.example.test').postSessionStart('session-1');

    expect(result.responseText).toBe('');
    expect(result.audioData.byteLength).toBe(0);
    expect(result.nextItemId).toBe('q-1');
  });

  it('requests a spoken reminder without fabricating a user transcript', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      responseText: 'Take your time.',
      audioData: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: 'q-1',
      nextQuestion: 'Question one?',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new ApiClient('token', 'https://api.example.test').postSilenceNudge('session-1', 'q-1');

    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      silenceNudge: true,
      sessionId: 'session-1',
      currentItemId: 'q-1',
    });
  });

  it('accepts a successful account deletion response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deleted: true }), { status: 200 })
    ));

    await expect(new ApiClient('token', 'https://api.example.test').deleteAccount()).resolves.toBeUndefined();
  });

  it('rejects a malformed account deletion response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    ));

    await expect(new ApiClient('token', 'https://api.example.test').deleteAccount())
      .rejects.toMatchObject({ name: 'ApiError', status: 500 });
  });

  it('accepts a successful session completion response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        date: '2026-09-10',
        reportMarkdown: 'Progress report text',
      }), { status: 200 })
    ));

    await expect(new ApiClient('token', 'https://api.example.test').completeSession('session-1'))
      .resolves.toEqual({ date: '2026-09-10', reportMarkdown: 'Progress report text' });
  });

  it('rejects a completed session response that does not include the committed report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, date: '2026-09-10' }), { status: 200 })
    ));

    await expect(new ApiClient('token', 'https://api.example.test').completeSession('session-1'))
      .rejects.toMatchObject({ name: 'ApiError', status: 500 });
  });

  it('surfaces non-success session completion responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'aggregation failed' }), { status: 500 })
    ));

    await expect(new ApiClient('token', 'https://api.example.test').completeSession('session-1'))
      .rejects.toBeInstanceOf(ApiError);
  });
});
