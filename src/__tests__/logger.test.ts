// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../logger';

async function flushLogQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ProductionTelemetryLogger context handling', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps context passed as the third argument when the component slot is undefined', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // This is the shape used across apiClient/useConversation. Before the fix
    // the context was silently discarded in production, so the real server
    // error never appeared in field logs.
    logger.error('transcript endpoint server error:', undefined, {
      status: 500,
      error: 'Mock exam is not waiting for an English exercise (stage=none).',
    });
    await flushLogQueue();

    if (errorSpy.mock.calls.length > 0) {
      // Development renderer: context is the last console argument.
      expect(errorSpy.mock.calls[0][3]).toMatchObject({
        status: 500,
        error: 'Mock exam is not waiting for an English exercise (stage=none).',
      });
    } else {
      // Production renderer: one JSON entry with a context object.
      const entry = JSON.parse(logSpy.mock.calls[0][0] as string) as { context?: Record<string, unknown> };
      expect(entry.context).toMatchObject({
        status: 500,
        error: 'Mock exam is not waiting for an English exercise (stage=none).',
      });
    }
  });
});
