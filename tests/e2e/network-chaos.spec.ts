import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';
import { mockTranscriptEndpoint, mockCompleteSession } from './fixtures/network';

test.describe('Network chaos', () => {
  test.beforeEach(async ({ context, page }) => {
    await ensureAuthenticated(context, page);
  });

  test('handles offline during transcript and recovers when online', async ({ page }) => {
    // Set up mock to succeed after reconnect
    await mockTranscriptEndpoint(page, {
      responseText: 'Back online and responding.',
      audioBase64: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: null,
      nextQuestion: null,
    });
    await mockCompleteSession(page);

    await page.context().setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    await page.context().setOffline(false);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);

    // App should recover; try sending a text message
    const input = page.getByTestId('centerpanel-input');
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill('Hello after reconnect');
    await page.getByTestId('centerpanel-send').click();

    const log = page.getByTestId('conversation-history-log');
    await expect(log).toContainText('Back online and responding.', { timeout: 30000 });
  });
});
