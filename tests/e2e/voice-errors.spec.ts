import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';
import { mockTranscriptEndpoint, mockCompleteSession } from './fixtures/network';

test.describe('Voice error recovery', () => {
  test.beforeEach(async ({ context, page }) => {
    await ensureAuthenticated(context, page);
  });

  test('surfaces error state when transcript request fails', async ({ page }) => {
    await mockTranscriptError(page, 503, 'Service Unavailable');

    const micButton = page.getByTestId('voicehub-mic-button');
    await expect(micButton).toBeVisible({ timeout: 15000 });
    await micButton.click();

    const consentAccept = page.getByTestId('mic-consent-accept');
    if (await consentAccept.isVisible({ timeout: 3000 }).catch(() => false)) {
      await consentAccept.click();
    }

    // Error banner/alert should surface; grant timeout buffer for retries
    const errorAlert = page.locator('[role="alert"]').filter({ hasText: /error|unavailable|500|503/i });
    await expect(errorAlert.first()).toBeVisible({ timeout: 60000 });
  });

  test('recovers on retry after transient failure', async ({ page }) => {
    // First call fails, second succeeds
    let callCount = 0;
    await page.route('**/transcript', async (route) => {
      callCount += 1;
      if (callCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service Unavailable' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          responseText: 'Recovered successfully.',
          audioData: '',
          verdict: null,
          needsConfirmation: false,
          nextItemId: null,
          nextQuestion: null,
        }),
      });
    });
    await mockCompleteSession(page);

    const micButton = page.getByTestId('voicehub-mic-button');
    await expect(micButton).toBeVisible({ timeout: 15000 });
    await micButton.click();

    const consentAccept = page.getByTestId('mic-consent-accept');
    if (await consentAccept.isVisible({ timeout: 3000 }).catch(() => false)) {
      await consentAccept.click();
    }

    // Should eventually recover and show the second response
    const log = page.getByTestId('conversation-history-log');
    await expect(log).toContainText('Recovered successfully.', { timeout: 90000 });
  });
});
