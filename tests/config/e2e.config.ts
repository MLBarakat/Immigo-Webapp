import { config as dotenvConfig } from 'dotenv';
import path from 'path';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.e2e') });
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

export const E2E_CONFIG = {
  baseURL: process.env.E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

  auth: {
    email: process.env.E2E_USER_EMAIL || process.env.TEST_USER_EMAIL || 'e2e-test@immigo.app',
    password: process.env.E2E_USER_PASSWORD || process.env.TEST_USER_PASSWORD || 'E2ETest123!',
    storageStatePath: process.env.E2E_STORAGE_STATE || path.join(process.cwd(), 'test-results', 'e2e-auth-state.json'),
  },

  supabase: {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'test-anon-key',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  api: {
    baseUrl: process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8787',
    key: process.env.VITE_API_KEY || process.env.API_KEY || '',
  },

  timeouts: {
    test: parseInt(process.env.E2E_TEST_TIMEOUT || '120000'),
    expect: parseInt(process.env.E2E_EXPECT_TIMEOUT || '20000'),
    action: parseInt(process.env.E2E_ACTION_TIMEOUT || '15000'),
    navigation: parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '30000'),
    globalSetup: parseInt(process.env.E2E_GLOBAL_SETUP_TIMEOUT || '60000'),
  },

  browser: {
    useFakeMedia: process.env.E2E_FAKE_MEDIA !== 'false',
    headless: process.env.E2E_HEADLESS !== 'false',
    slowMo: parseInt(process.env.E2E_SLOW_MO || '0'),
  },

  flags: {
    isCI: !!process.env.CI,
    isE2E: process.env.VITE_E2E === 'true' || process.env.E2E === 'true',
    useStorageState: process.env.PLAYWRIGHT_STORAGE_STATE !== 'false',
    mockSupabase: process.env.E2E_MOCK_SUPABASE === 'true',
    mockApi: process.env.E2E_MOCK_API !== 'false',
  },

  artifacts: {
    trace: process.env.E2E_TRACE || 'on-first-retry',
    screenshot: process.env.E2E_SCREENSHOT || 'only-on-failure',
    video: process.env.E2E_VIDEO || 'on-first-retry',
  },

  testData: {
    defaultTranscriptResponse: 'E2E test response from mock.',
    defaultAudioBase64: '',
  },
} as const;

export const getE2EConfig = () => E2E_CONFIG;
export default E2E_CONFIG;
