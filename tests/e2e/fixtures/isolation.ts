import { Page } from '@playwright/test';
import { randomUUID } from 'crypto';

export interface IsolationOptions {
  userId?: string;
  email?: string;
}

export function generateTestUser(): { userId: string; email: string; password: string } {
  const id = randomUUID().slice(0, 8);
  const ts = Date.now();
  return {
    userId: `e2e_${id}_${ts}`,
    email: `e2e-${id}-${ts}@immigo.app`,
    password: 'E2ETest123!',
  };
}

export async function mockSupabaseAuthWithIsolation(page: Page, options: IsolationOptions = {}) {
  const { userId, email } = options.userId && options.email
    ? { userId: options.userId, email: options.email }
    : generateTestUser();

  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/token') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: `e2e-token-${userId}`,
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: `e2e-refresh-${userId}`,
          user: {
            id: userId,
            email,
            user_metadata: { full_name: 'E2E Test User' },
            app_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
          session: {
            access_token: `e2e-token-${userId}`,
            refresh_token: `e2e-refresh-${userId}`,
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: userId,
              email,
              user_metadata: { full_name: 'E2E Test User' },
              app_metadata: {},
              aud: 'authenticated',
            },
          },
        }),
      });
      return;
    }

    if (url.includes('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: userId,
          email,
          user_metadata: { full_name: 'E2E Test User' },
          app_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        }),
      });
      return;
    }

    if (url.includes('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.continue();
  });

  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('profiles')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: userId, full_name: 'E2E Test User', language: 'en' }),
      });
      return;
    }
    if (url.includes('user_settings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user_id: userId, theme: 'light', language: 'en', font_size: 'medium', updated_at: new Date().toISOString() }),
      });
      return;
    }
    if (url.includes('active_user_sessions')) {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  return { userId, email };
}
