import type { ThemeOption } from '../types/settings';

export function normalizeTheme(theme: unknown): ThemeOption {
  return theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: ThemeOption): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', normalizeTheme(theme) === 'dark');
}
