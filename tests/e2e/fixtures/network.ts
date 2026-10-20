import { Page } from '@playwright/test';

export interface TranscriptFixture {
  responseText: string;
  audioBase64: string;
  verdict?: 'correct' | 'incorrect' | 'partial' | null;
  needsConfirmation?: boolean;
  nextItemId?: string | null;
  nextQuestion?: string | null;
}

const DEFAULT_SILENT_MP3_BASE64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjgzLjEwMAAAAAAAAAAAAAAA';
// Fallback silent audio if needed; most specs will provide their own base64 WAV/MP3.
// Using a tiny placeholder keeps the shape valid for the API client decoder.

export async function mockTranscriptEndpoint(page: Page, fixture: TranscriptFixture) {
  await page.route('**/transcript', async (route) => {
    const body = fixture.audioBase64
      ? {
          responseText: fixture.responseText,
          audioData: fixture.audioBase64,
          verdict: fixture.verdict ?? null,
          needsConfirmation: fixture.needsConfirmation ?? false,
          nextItemId: fixture.nextItemId ?? null,
          nextQuestion: fixture.nextQuestion ?? null,
        }
      : {
          responseText: fixture.responseText,
          audioData: DEFAULT_SILENT_MP3_BASE64,
          verdict: fixture.verdict ?? null,
          needsConfirmation: fixture.needsConfirmation ?? false,
          nextItemId: fixture.nextItemId ?? null,
          nextQuestion: fixture.nextQuestion ?? null,
        };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

export async function mockCompleteSession(page: Page, responseBody: Record<string, unknown> = { ok: true }) {
  await page.route('**/complete-session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    });
  });
}

export async function mockTranscriptError(page: Page, status = 500, message = 'Server Error') {
  await page.route('**/transcript', async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: message }),
    });
  });
}
