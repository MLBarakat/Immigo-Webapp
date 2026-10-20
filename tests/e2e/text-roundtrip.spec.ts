import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';
import { mockTranscriptEndpoint, mockCompleteSession } from './fixtures/network';

test.describe('Text conversation roundtrip', () => {
  test.beforeEach(async ({ context, page }) => {
    await ensureAuthenticated(context, page);
  });

  test('sends text message and receives assistant response', async ({ page }) => {
    await mockTranscriptEndpoint(page, {
      responseText: 'Great question! Let’s proceed.',
      audioBase64: '',
      verdict: 'correct',
      needsConfirmation: false,
      nextItemId: null,
      nextQuestion: null,
    });
    await mockCompleteSession(page);

    // Send a text message
    const input = page.getByTestId('centerpanel-input');
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill('Hello, test roundtrip');
    await page.getByTestId('centerpanel-send').click();

    // Assistant response should appear in history
    const log = page.getByTestId('conversation-history-log');
    await expect(log).toContainText('Hello, test roundtrip', { timeout: 15000 });
    await expect(log).toContainText('Great question!', { timeout: 15000 });
  });
});
