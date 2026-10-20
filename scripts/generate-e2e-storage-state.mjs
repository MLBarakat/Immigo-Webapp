import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const STORAGE_PATH = path.join(process.cwd(), 'test-results', 'e2e-auth-state.json');

async function main() {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
  await page.goto(baseURL);

  const email = process.env.E2E_USER_EMAIL || 'e2e-test@immigo.app';
  const password = process.env.E2E_USER_PASSWORD || 'E2ETest123!';

  try {
    const emailInput = page.getByTestId('auth-email');
    if (await emailInput.isVisible({ timeout: 5000 })) {
      await emailInput.fill(email);
      await page.getByTestId('auth-password').fill(password);
      await page.getByTestId('auth-submit').click();
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    }
  } catch (e) {
    console.error('Login attempt failed:', e.message);
  }

  await context.storageState({ path: STORAGE_PATH });
  console.log('Saved storage state to', STORAGE_PATH);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
