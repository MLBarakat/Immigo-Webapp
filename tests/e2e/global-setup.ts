import { chromium, FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function globalSetup(config: FullConfig) {
  const storagePath = path.join(process.cwd(), 'test-results', 'e2e-auth-state.json');
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });

  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
  const email = process.env.E2E_USER_EMAIL || 'e2e-test@immigo.app';
  const password = process.env.E2E_USER_PASSWORD || 'E2ETest123!';

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

  try {
    await page.goto(baseURL);
    const emailInput = page.getByTestId('auth-email');
    if (await emailInput.isVisible({ timeout: 5000 })) {
      await emailInput.fill(email);
      await page.getByTestId('auth-password').fill(password);
      await page.getByTestId('auth-submit').click();
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    }
    await context.storageState({ path: storagePath });
  } catch (e) {
    console.warn('Global setup: could not generate storage state:', e);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
