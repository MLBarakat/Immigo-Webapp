import { Page } from '@playwright/test';

export const E2E_USER = {
  email: process.env.E2E_USER_EMAIL || 'e2e-test@immigo.app',
  password: process.env.E2E_USER_PASSWORD || 'E2ETest123!',
};

export async function mockSupabaseAuth(page: Page, options: { userId?: string; email?: string } = {}) {
  const userId = options.userId || 'e2e-user-0001';
  const email = options.email || E2E_USER.email;

  // Mock common Supabase GoTrue endpoints
  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/token') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'e2e-refresh-token',
          user: {
            id: userId,
            email,
            user_metadata: { full_name: 'E2E Test User' },
            app_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
          session: {
            access_token: 'e2e-access-token',
            refresh_token: 'e2e-refresh-token',
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

    if (url.includes('/user') && (method === 'GET' || method === 'PUT')) {
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

    if (url.includes('/logout') && method === 'POST') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.continue();
  });

  // Mock PostgREST endpoints used by AuthContext
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
        body: JSON.stringify({
          user_id: userId,
          theme: 'light',
          language: 'en',
          font_size: 'medium',
          updated_at: new Date().toISOString(),
        }),
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
}
