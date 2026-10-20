import { test as base, Page, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// export const TEST_USER_EMAIL = 'e2e-test@immigo.app';
// export const TEST_USER_PASSWORD = 'E2ETest123!';
export const TEST_USER_EMAIL = 'eng_ml@aucegypt.edu';
export const TEST_USER_PASSWORD = 'Biko_1234';

export async function createE2EStorageStateIfNeeded(): Promise<string> {
  const statePath = path.join(process.cwd(), 'test-results', 'e2e-auth-state.json');
  if (fs.existsSync(statePath)) return statePath;
  // Create directory if missing
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  // Return path (caller will generate by logging in once)
  return statePath;
}

export async function ensureAuthenticated(context: BrowserContext, page: Page, baseURL?: string) {
  const statePath = await createE2EStorageStateIfNeeded();
  if (fs.existsSync(statePath)) {
    await context.addCookies((JSON.parse(fs.readFileSync(statePath, 'utf-8')) as any).cookies ?? []);
    return;
  }
  await page.goto(baseURL ?? '/');
  // Best-effort login if AuthPage is visible
  const emailInput = page.locator('[data-testid="auth-email"]');
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailInput.fill(TEST_USER_EMAIL);
    await page.locator('[data-testid="auth-password"]').fill(TEST_USER_PASSWORD);
    await page.locator('[data-testid="auth-submit"]').click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }
  await context.storageState({ path: statePath });
}
