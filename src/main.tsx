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

// Cross-document death marker. sessionStorage survives WebContent process
// kills on iOS (it is persisted by the browser UI process), so a boot that
// finds the previous document's record with pagehideFired:false proves that
// document died WITHOUT unloading (crash / OOM kill) rather than navigating.
const DIAG_TOMBSTONE_KEY = 'immigo_doc_tombstone_v1';
interface DiagDocTombstone {
  bootId: string;
  time: string;
  pagehideFired: boolean;
}
const readDiagTombstone = (): DiagDocTombstone | null => {
  try {
    const raw = sessionStorage.getItem(DIAG_TOMBSTONE_KEY);
    return raw ? (JSON.parse(raw) as DiagDocTombstone) : null;
  } catch { return null; }
};
const writeDiagTombstone = (record: DiagDocTombstone): void => {
  try { sessionStorage.setItem(DIAG_TOMBSTONE_KEY, JSON.stringify(record)); } catch { /* storage unavailable */ }
};

const previousDoc = readDiagTombstone();
if (previousDoc) {
  console.info(`[BOOT] ${JSON.stringify({
    phase: 'previous-document-fate',
    previousBootId: previousDoc.bootId,
    previousBootTime: previousDoc.time,
    previousPagehideFired: previousDoc.pagehideFired,
    implication: previousDoc.pagehideFired
      ? 'previous document unloaded normally (navigation or back/forward traversal)'
      : 'previous document died WITHOUT pagehide (process kill or crash)',
  })}`);
}
writeDiagTombstone({ bootId, time: new Date().toISOString(), pagehideFired: false });

try {
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  console.info(`[BOOT] ${JSON.stringify({
    bootId,
    time: new Date().toISOString(),
    visibility: document.visibilityState,
    navigationType: navEntry?.type ?? 'unknown',
    redirectCount: navEntry?.redirectCount ?? null,
    referrerOrigin: document.referrer ? new URL(document.referrer).origin : '(none)',
    isSameOriginReferrer: document.referrer
      ? new URL(document.referrer).origin === window.location.origin
      : null,
    historyLength: window.history.length,
  })}`);
} catch {
  console.info(`[BOOT] ${JSON.stringify({ bootId })}`);
}
window.addEventListener('pagehide', (event) => {
  console.info(`[PAGEHIDE] ${JSON.stringify({ bootId, persisted: event.persisted, time: Date.now() })}`);
  writeDiagTombstone({ bootId, time: new Date().toISOString(), pagehideFired: true });
});
window.addEventListener('pageshow', (event) => {
  console.info(`[PAGESHOW] ${JSON.stringify({ bootId, persisted: event.persisted, time: Date.now() })}`);
});
// Same-document history probes: a real user back/forward within the SPA fires
// popstate first; a cross-document restore (crash/memory kill) never does.
window.addEventListener('popstate', () => {
  console.info(`[HISTORY-EVENT] ${JSON.stringify({ bootId, event: 'popstate', historyLength: window.history.length })}`);
});
window.addEventListener('hashchange', () => {
  console.info(`[HISTORY-EVENT] ${JSON.stringify({ bootId, event: 'hashchange', url: window.location.href })}`);
});
// Page Lifecycle probes (Chrome/Chromium-based browsers; inert on WebKit).
type DiagLifecycleDocument = { addEventListener(type: string, listener: () => void): void };
(document as unknown as DiagLifecycleDocument).addEventListener('freeze', () => {
  console.info(`[LIFECYCLE-EVENT] ${JSON.stringify({ bootId, event: 'freeze' })}`);
});
(document as unknown as DiagLifecycleDocument).addEventListener('resume', () => {
  console.info(`[LIFECYCLE-EVENT] ${JSON.stringify({ bootId, event: 'resume' })}`);
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
