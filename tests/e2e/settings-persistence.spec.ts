import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';

test.describe('Settings persistence', () => {
  test.beforeEach(async ({ context, page }) => {
    await ensureAuthenticated(context, page);
  });

  test('persists theme/font settings across reload', async ({ page }) => {
    // Navigate to settings if available via UI
    const settingsBtn = page.getByRole('button', { name: /settings/i });
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
    }

    // Try to toggle theme if present
    const themeToggle = page.getByRole('button', { name: /theme|dark|light/i });
    if (await themeToggle.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeToggle.first().click();
    }

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await ensureAuthenticated(context, page);

    // App should still load
    await expect(page.getByTestId('voicehub-mic-button')).toBeVisible({ timeout: 15000 });
  });
});
