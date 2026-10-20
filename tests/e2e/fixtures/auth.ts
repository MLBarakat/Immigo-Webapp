import { test as base, Page, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { E2E_CONFIG } from '../config';

export const TEST_USER_EMAIL = E2E_CONFIG.auth.email;
export const TEST_USER_PASSWORD = E2E_CONFIG.auth.password;

export async function createE2EStorageStateIfNeeded(): Promise<string> {
  const statePath = path.join(process.cwd(), 'test-results', 'e2e-auth-state.json');
  if (fs.existsSync(statePath)) return statePath;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  return statePath;
}

export async function ensureAuthenticated(context: BrowserContext, page: Page, baseURL?: string) {
  const statePath = await createE2EStorageStateIfNeeded();
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (state.cookies) {
        await context.addCookies(state.cookies);
        await page.goto(baseURL ?? '/');
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        return;
      }
    } catch {}
  }

  await page.goto(baseURL ?? '/');
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

  const emailInput = page.getByTestId('auth-email');
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(TEST_USER_EMAIL);
    await page.getByTestId('auth-password').fill(TEST_USER_PASSWORD);
    await page.getByTestId('auth-submit').click();
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  }

  try {
    await context.storageState({ path: statePath });
  } catch {}
}
