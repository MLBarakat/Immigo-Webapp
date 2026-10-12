import type { ThemeOption } from '../types/settings';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export function applyTheme(theme: ThemeOption): void {
  if (typeof document === 'undefined') return;

  const prefersDark = theme === 'system'
    && typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(SYSTEM_DARK_QUERY).matches;

  document.documentElement.classList.toggle('dark', theme === 'dark' || prefersDark);
}

export function subscribeToSystemThemeChange(listener: () => void): (() => void) | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

  const mediaQuery = window.matchMedia(SYSTEM_DARK_QUERY);
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
}
