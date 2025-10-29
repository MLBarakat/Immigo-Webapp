import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { logger } from './logger';

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
    <App />
  </StrictMode>
);