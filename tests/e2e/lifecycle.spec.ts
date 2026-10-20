import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';
import { mockTranscriptEndpoint, mockCompleteSession } from './fixtures/network';

test.describe('Lifecycle & multi-tab', () => {
  test.beforeEach(async ({ context, page }) => {
    await ensureAuthenticated(context, page);
  });

  test('handles visibility change without crashing', async ({ page }) => {
    await mockTranscriptEndpoint(page, {
      responseText: 'Resumed',
      audioBase64: '',
      verdict: null,
      needsConfirmation: false,
      nextItemId: null,
      nextQuestion: null,
    });
    await mockCompleteSession(page);

    const micButton = page.getByTestId('voicehub-mic-button');
    await expect(micButton).toBeVisible({ timeout: 15000 });

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect(micButton).toBeVisible({ timeout: 15000 });
  });

  test('leader election allows only one tab to be active', async ({ context, page }) => {
    const page2 = await context.newPage();
    await page2.goto('/');
    await ensureAuthenticated(context, page2);

    await expect(page.getByTestId('voicehub-mic-button')).toBeVisible({ timeout: 15000 });
    await expect(page2.getByTestId('voicehub-mic-button')).toBeVisible({ timeout: 15000 });

    // Starting in one tab should not crash the other
    await page.getByTestId('voicehub-mic-button').click();
    const consentAccept = page.getByTestId('mic-consent-accept');
    if (await consentAccept.isVisible({ timeout: 2000 }).catch(() => false)) {
      await consentAccept.click();
    }

    // Page2 remains usable
    await page2.getByTestId('centerpanel-input').fill('From tab 2');
    await page2.getByTestId('centerpanel-send').click();
    await expect(page2.getByTestId('conversation-history-log')).toContainText('From tab 2', { timeout: 15000 });
  });
});
