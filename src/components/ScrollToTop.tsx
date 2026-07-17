import { useEffect } from 'react';

export function ScrollToTop(): null {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return null;
}