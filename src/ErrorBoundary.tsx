import React from 'react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';
import { logger } from './logger';

// This is the fallback component that gets rendered when an error is caught.
function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  // Log the error to our logger as soon as the boundary is triggered.
  React.useEffect(() => {
    logger.error('A rendering error was caught by the Error Boundary', error);
  }, [error]);

  const isDev = import.meta.env.DEV;

  return (
    <div role="alert" style={{ padding: '20px', border: '1px solid #FF0000', margin: '20px', backgroundColor: '#FFF0F0', color: '#000' }}>
      <h2 style={{ color: '#D8000C' }}>Something went wrong.</h2>
      <p>We apologize for the inconvenience. The error has been logged, and our team will look into it.</p>
      
      {isDev && (
        <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px', backgroundColor: '#f3f3f3', padding: '10px' }}>
          <summary>Error Details (Development Only)</summary>
          <p style={{ color: 'red' }}>{error.message}</p>
          <pre style={{ color: '#555' }}>{error.stack}</pre>
        </details>
      )}

      <button 
        onClick={resetErrorBoundary} 
        style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer', border: '1px solid #D8000C', backgroundColor: '#D8000C', color: 'white' }}
      >
        Try again
      </button>
    </div>
  );
}

// This is the main ErrorBoundary component that will wrap parts of our app.
export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const handleReset = () => {
    // This function is called when the user clicks the "Try again" button.
    // For now, a simple page reload is a reasonable default recovery strategy.
    // In a more complex app, you might clear some state or navigate away.
    window.location.reload();
  };

  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={handleReset}
    >
      {children}
    </ReactErrorBoundary>
  );
}
