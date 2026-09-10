import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './apiClient';

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
