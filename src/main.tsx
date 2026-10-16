import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { logger } from './logger';
import { ErrorBoundary } from './ErrorBoundary';

// --- Temporary mobile reload diagnostics (no mic data, tokens, or PII) ---
// Distinguishes browser reload (new bootId) from React remount (same bootId).
const bootId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `boot-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
try {
  const navType = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  console.info(`[BOOT] ${JSON.stringify({
    bootId,
    time: new Date().toISOString(),
    visibility: document.visibilityState,
    navigationType: navType?.type ?? 'unknown',
  })}`);
} catch {
  console.info(`[BOOT] ${JSON.stringify({ bootId })}`);
}
window.addEventListener('pagehide', (event) => {
  console.info(`[PAGEHIDE] ${JSON.stringify({ bootId, persisted: event.persisted, time: Date.now() })}`);
});
window.addEventListener('pageshow', (event) => {
  console.info(`[PAGESHOW] ${JSON.stringify({ bootId, persisted: event.persisted, time: Date.now() })}`);
});
// --- End diagnostics ---

// --- Global Error Handling ---
// This acts as a last-resort catch-all for errors not caught by other means.

// Catches errors that happen outside of React's render cycle (e.g., in event handlers)
window.addEventListener('error', (event) => {
  logger.error('Unhandled global error', event.error, {
    source: 'window.onerror',
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

// Catches unhandled promise rejections (e.g., from async functions without a .catch)
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', event.reason, { 
    source: 'window.onunhandledrejection' 
  });
});

// --- End Global Error Handling ---

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
