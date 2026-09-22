import { FontSize } from '../types/settings';

export const FONT_SIZES = [
  'extra-small',
  'small',
  'default',
  'large',
  'extra-large',
] as const;

export type CanonicalFontSize = (typeof FONT_SIZES)[number];

export const FONT_SIZE_LABELS: Record<CanonicalFontSize, string> = {
  'extra-small': 'XS',
  'small': 'S',
  'default': 'M',
  'large': 'L',
  'extra-large': 'XL',
};

export const FONT_SIZE_PERCENTAGES: Record<CanonicalFontSize, string> = {
  'extra-small': '80%',
  'small': '90%',
  'default': '100%',
  'large': '112.5%',
  'extra-large': '125%',
};

export const STORAGE_KEY_FONT_SIZE = 'immigo_font_size';

export function normalizeFontSize(size?: string | null): CanonicalFontSize {
  if (!size) return 'default';
  switch (size.toLowerCase()) {
    case 'xs':
    case 'extra-small':
    case 'extrasmall':
      return 'extra-small';
    case 'sm':
    case 'small':
      return 'small';
    case 'md':
    case 'medium':
    case 'base':
    case 'default':
      return 'default';
    case 'lg':
    case 'large':
      return 'large';
    case 'xl':
    case 'extra-large':
    case 'extralarge':
      return 'extra-large';
    default:
      return 'default';
  }
}

export function getStoredFontSize(): CanonicalFontSize {
  if (typeof window === 'undefined') return 'default';
  try {
    const saved = localStorage.getItem(STORAGE_KEY_FONT_SIZE);
    return saved ? normalizeFontSize(saved) : 'default';
  } catch {
    return 'default';
  }
}

export function applyFontSize(size?: FontSize | string | null): CanonicalFontSize {
  const canonical = normalizeFontSize(size);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.setAttribute('data-font-size', canonical);
    root.style.fontSize = FONT_SIZE_PERCENTAGES[canonical] || '100%';
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_FONT_SIZE, canonical);
    } catch {
      // Ignore localStorage write failures (e.g. private mode or storage quota)
    }
  }

  return canonical;
}
