import path from 'path';
import { defineConfig, devices } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';

// Load the E2E environment before Vite starts, so the dev server receives the
// local Supabase URL and key. .env.e2e wins over .env, matching the test config.
dotenvConfig({ path: path.resolve(process.cwd(), '.env.e2e') });
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const useExternalServer = Boolean(process.env.E2E_BASE_URL);
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const allowRemote = process.env.E2E_ALLOW_REMOTE === 'true';

function jwtProjectRef(token: string | undefined): string | undefined {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 3) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof claims.ref === 'string' ? claims.ref : undefined;
  } catch {
    return undefined;
  }
}

let supabaseIsLocal = false;
try {
  supabaseIsLocal = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(
    new URL(supabaseUrl).hostname,
  );
} catch {
  supabaseIsLocal = false;
}

if (supabaseUrl && !supabaseIsLocal && !allowRemote) {
  throw new Error(
    `Refusing to run E2E against non-local Supabase: ${supabaseUrl}. ` +
      'Set VITE_SUPABASE_URL in .env.e2e to http://127.0.0.1:54321, or set ' +
      'E2E_ALLOW_REMOTE=true only for a deliberate remote run.',
  );
}

const projectRef = jwtProjectRef(
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
);
if (supabaseIsLocal && projectRef) {
  throw new Error(
    'E2E has a local Supabase URL but a hosted anon key ' +
      `(project ref: ${projectRef}). Copy the local ANON_KEY from ` +
      '`npx supabase status -o env` into .env.e2e.',
  );
}

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const useExternalServer = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['line'], ['junit', { outputFile: 'test-results/junit.xml' }]],
  timeout: 120000,
  expect: { timeout: 20000 },
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    storageState: 'test-results/e2e-auth-state.json',
    permissions: ['microphone'],
    actionTimeout: 15000,
    navigationTimeout: 30000,
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-device-for-media-stream=default',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: useExternalServer ? undefined : {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    env: {
      ...process.env,
      VITE_E2E: process.env.VITE_E2E ?? 'true',
    },
  },
});
