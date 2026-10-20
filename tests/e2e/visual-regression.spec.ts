import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './fixtures/auth';
import percySnapshot from '@percy/playwright';

test.describe('Visual regression', () => {
  test.beforeEach(async ({ context, page }) => {
    await ensureAuthenticated(context, page);
  });

  test('auth page snapshot', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByTestId('auth-submit')).toBeVisible({ timeout: 10000 });
    await percySnapshot(page, 'Auth Page');
  });

  test('workspace default state snapshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('voicehub-mic-button')).toBeVisible({ timeout: 15000 });
    await percySnapshot(page, 'Workspace - Default');
  });
});
