import { test, expect } from '@playwright/test';
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from './fixtures/auth';

test.describe('Auth flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  });

  test('shows auth page when unauthenticated', async ({ page }) => {
    // App shows AuthPage if no session
    await expect(page.getByTestId('auth-email')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('auth-password')).toBeVisible();
    await expect(page.getByTestId('auth-submit')).toBeVisible();
  });

  test('logs in with valid credentials (uses local Supabase if configured)', async ({ page }) => {
    await page.getByTestId('auth-email').fill(TEST_USER_EMAIL);
    await page.getByTestId('auth-password').fill(TEST_USER_PASSWORD);
    await page.getByTestId('auth-submit').click();

    // After auth, should see voice/workspace UI
    await expect(page.getByRole('region', { name: /voice/i })).toBeVisible({ timeout: 30000 });
  });
});
