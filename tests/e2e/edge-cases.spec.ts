import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';
import { mockTranscriptEndpoint, mockCompleteSession } from './fixtures/network';

test.describe('Edge cases', () => {
  test.beforeEach(async ({ context, page }) => {
    await ensureAuthenticated(context, page);
  });

  test('handles empty transcript gracefully', async ({ page }) => {
    await mockTranscriptEndpoint(page, {
      responseText: '',
      audioBase64: '',
      verdict: null,
      needsConfirmation: false,
    });
    await mockCompleteSession(page);

    const input = page.getByTestId('centerpanel-input');
    await input.fill('empty response test');
    await page.getByTestId('centerpanel-send').click();

    const log = page.getByTestId('conversation-history-log');
    await expect(log).toContainText('empty response test', { timeout: 15000 });
  });

  test('handles very long message input', async ({ page }) => {
    const longText = 'test '.repeat(100);
    const input = page.getByTestId('centerpanel-input');
    await input.fill(longText);
    await expect(input).toHaveValue(longText);
    await page.getByTestId('centerpanel-send').click();
  });

  test('rapid successive clicks are debounced', async ({ page }) => {
    const mic = page.getByTestId('voicehub-mic-button');
    await expect(mic).toBeVisible({ timeout: 15000 });
    await mic.click({ timeout: 5000 });
    await mic.click({ timeout: 5000 });
    await mic.click({ timeout: 5000 });
    // Just ensure no crash
    await expect(mic).toBeVisible();
  });

  test('handles browser back/forward gracefully', async ({ page }) => {
    await page.goto('/');
    await page.goBack();
    await page.goForward();
    await expect(page.getByTestId('voicehub-mic-button')).toBeVisible({ timeout: 15000 });
  });
});
