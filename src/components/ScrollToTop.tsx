import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function ScrollToTop(): null {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll the window to the top on every route change.
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}