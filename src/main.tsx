import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { env as ortEnv } from 'onnxruntime-web';
import App from './App';
import './index.css';
import './i18n';
import { logger } from './logger';
import { ErrorBoundary } from './ErrorBoundary';
import { constrainOrtWasmThreadsForMobile } from './utils/ortWasmConfig';
import { readDocTombstone, writeDocTombstone, markDocTombstone } from './utils/docTombstone';

// --- Mobile memory guard (ORT WASM thread cap) ---
// Runs before any InferenceSession is created (the VAD's session is created
// inside MicVAD.new, which only ever runs from a mounted-component effect,
// long after this module executes). Caps the main-thread ORT instance — the
// one @ricky0123/vad-web uses for Silero — to a single wasm thread on
// phone-class devices; the whisper worker configures its own realm separately.
// See src/utils/ortWasmConfig.ts for the field evidence behind this.
const ortWasmThreads = constrainOrtWasmThreadsForMobile(
  ortEnv.wasm,
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
  typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0,
);
console.info(`[ORT-CONFIG] ${JSON.stringify({ scope: 'main-thread-vad', wasmThreads: ortWasmThreads })}`);

// --- Temporary mobile reload diagnostics (no mic data, tokens, or PII) ---
// Distinguishes browser reload (new bootId) from React remount (same bootId).
const bootId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `boot-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

// Cross-document death marker (schema + IO in utils/docTombstone.ts).
// sessionStorage survives WebContent process kills on iOS (persisted by the
// browser UI process), so a boot that finds the previous document's record
// with pagehideFired:false proves that document died WITHOUT unloading
// (crash / OOM kill) rather than navigating. The extended marks below let the
// NEXT boot also report WHERE in the submit cycle the death landed.
const previousDoc = readDocTombstone();
const msSinceIso = (iso?: string | null): number | null =>
  iso && !Number.isNaN(Date.parse(iso)) ? Math.max(0, Date.now() - Date.parse(iso)) : null;
if (previousDoc) {
  // lastBeatAgeMs = time from the last alive-mark to this boot; it bounds the
  // kill moment (death happened within [lastBeatAt, boot], heartbeat = 2s).
  const lastBeatAgeMs = msSinceIso(previousDoc.lastBeatAt);
  const submitPhase = previousDoc.submitAt
    ? (previousDoc.submitResponseAt ? 'response-received'
      : previousDoc.submitErrorAt ? 'request-error' : 'waiting-for-response')
    : 'none';
  const inferencePhase = previousDoc.inferAt
    ? (previousDoc.inferCompletedAt ? 'completed'
      : previousDoc.inferErrorAt ? 'failed' : 'in-flight')
    : 'none';
  console.info(`[BOOT] ${JSON.stringify({
    phase: 'previous-document-fate',
    previousBootId: previousDoc.bootId,
    previousBootTime: previousDoc.time,
    previousPagehideFired: previousDoc.pagehideFired,
    implication: previousDoc.pagehideFired
      ? 'previous document unloaded normally (navigation or back/forward traversal)'
      : 'previous document died WITHOUT pagehide (process kill or crash)',
    // Kill-context discriminators (null/none = marker never recorded):
    previousHiddenBeforeDeath: previousDoc.lastVisibilityState === 'hidden' ? true
      : previousDoc.lastVisibilityState === 'visible' ? false : null,
    lastBeatAgeMsAtBoot: lastBeatAgeMs,
    lastBeatHidden: previousDoc.lastBeatHidden ?? null,
    lastBeatJsHeap: previousDoc.lastBeatJsHeap ?? null,
    previousSubmitPhase: submitPhase,
    msSinceSubmitDispatchAtBoot: msSinceIso(previousDoc.submitAt),
    previousInferencePhase: inferencePhase,
    msSinceInferDispatchAtBoot: msSinceIso(previousDoc.inferAt),
  })}`);
}
// Fresh record for THIS document — a full replace that clears all prior marks.
writeDocTombstone({ bootId, time: new Date().toISOString(), pagehideFired: false });

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
  markDocTombstone({ pagehideFired: true, pagehideAt: new Date().toISOString() });
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

// Visibility marks: the DYING document's own visibilitychange handler cannot
// run after an OS kill, so the tombstone records every transition here (this
// listener is registered independently of the feature code in useWhisper).
// `previousHiddenBeforeDeath` on the next boot = last recorded state.
document.addEventListener('visibilitychange', () => {
  markDocTombstone({
    lastVisibilityState: document.visibilityState,
    lastVisibilityAt: new Date().toISOString(),
  });
  console.info(`[VISIBILITY-EVENT] ${JSON.stringify({ bootId, state: document.visibilityState })}`);
});

// 2s heartbeat: silent tombstone marks (no console spam) that bound the kill
// moment to ≤2s and carry the freshest pre-death visibility state. On engines
// that expose it (Chrome Android/desktop), also snapshots the JS heap —
// WebKit does not implement performance.memory, so iOS reports null.
const readJsHeap = (): number | null => {
  const perfMemory = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof perfMemory?.usedJSHeapSize === 'number' ? perfMemory.usedJSHeapSize : null;
};
window.setInterval(() => {
  markDocTombstone({
    lastBeatAt: new Date().toISOString(),
    lastBeatHidden: document.hidden,
    lastBeatJsHeap: readJsHeap(),
  });
}, 2000);
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
