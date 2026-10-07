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
      { simulationMode: 'study', preferredLanguage: 'es-ES' }
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      simulationMode: 'study',
      preferredLanguage: 'es-ES',
    });
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
      new Response(JSON.stringify({ success: true, date: '2026-09-10' }), { status: 200 })
    ));

    await expect(new ApiClient('token', 'https://api.example.test').completeSession('session-1'))
      .resolves.toBeUndefined();
  });

  it('surfaces non-success session completion responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'aggregation failed' }), { status: 500 })
    ));

    await expect(new ApiClient('token', 'https://api.example.test').completeSession('session-1'))
      .rejects.toBeInstanceOf(ApiError);
  });
});
