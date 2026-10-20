export const TEST_IDS = {
  auth: {
    email: 'auth-email',
    password: 'auth-password',
    fullname: 'auth-fullname',
    submit: 'auth-submit',
    toggleMode: 'auth-toggle-mode',
  },
  voicehub: {
    micButton: 'voicehub-mic-button',
    region: 'voicehub-region',
  },
  micConsent: {
    accept: 'mic-consent-accept',
    cancel: 'mic-consent-cancel',
  },
  centerPanel: {
    input: 'centerpanel-input',
    send: 'centerpanel-send',
    error: 'centerpanel-error',
    dismiss: 'centerpanel-dismiss',
  },
  conversationHistory: {
    log: 'conversation-history-log',
    sentinel: 'conversation-history-sentinel',
  },
  settings: {
    button: 'settings-button',
    themeToggle: 'settings-theme-toggle',
    fontSize: 'settings-font-size',
    save: 'settings-save',
  },
  account: {
    menu: 'account-menu',
    logout: 'account-logout',
  },
} as const;

export const ROUTES = {
  home: '/',
  auth: '/auth',
  settings: '/settings',
  account: '/account',
} as const;

export const API_ENDPOINTS = {
  transcript: '/transcript',
  completeSession: '/complete-session',
  deleteAccount: '/delete-account',
} as const;

export const SELECTORS = {
  roleAlert: '[role="alert"]',
  roleLog: '[role="log"]',
  roleRegion: '[role="region"]',
  roleButton: 'button',
} as const;

export const TIMEOUTS = {
  short: 5000,
  medium: 15000,
  long: 30000,
  veryLong: 60000,
  extraLong: 120000,
} as const;

export const RETRY = {
  maxRetries: 3,
  delayMs: 1000,
} as const;

export default {
  TEST_IDS,
  ROUTES,
  API_ENDPOINTS,
  SELECTORS,
  TIMEOUTS,
  RETRY,
};
