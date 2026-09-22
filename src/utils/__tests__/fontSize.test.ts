import { describe, it, expect, beforeEach } from 'vitest';
import {
  FONT_SIZES,
  FONT_SIZE_LABELS,
  FONT_SIZE_PERCENTAGES,
  normalizeFontSize,
  applyFontSize,
  getStoredFontSize,
  STORAGE_KEY_FONT_SIZE,
} from '../fontSize';

describe('fontSize utility', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-font-size');
    document.documentElement.style.fontSize = '';
  });

  it('provides at least five distinct font size levels in sequential order', () => {
    expect(FONT_SIZES.length).toBeGreaterThanOrEqual(5);
    expect(FONT_SIZES).toEqual(['extra-small', 'small', 'default', 'large', 'extra-large']);
  });

  it('maps each size to an intuitive label', () => {
    expect(FONT_SIZE_LABELS['extra-small']).toBe('XS');
    expect(FONT_SIZE_LABELS['small']).toBe('S');
    expect(FONT_SIZE_LABELS['default']).toBe('M');
    expect(FONT_SIZE_LABELS['large']).toBe('L');
    expect(FONT_SIZE_LABELS['extra-large']).toBe('XL');
  });

  it('maps each size to scaling percentages', () => {
    expect(FONT_SIZE_PERCENTAGES['extra-small']).toBe('80%');
    expect(FONT_SIZE_PERCENTAGES['small']).toBe('90%');
    expect(FONT_SIZE_PERCENTAGES['default']).toBe('100%');
    expect(FONT_SIZE_PERCENTAGES['large']).toBe('112.5%');
    expect(FONT_SIZE_PERCENTAGES['extra-large']).toBe('125%');
  });

  it('normalizes various input strings correctly', () => {
    expect(normalizeFontSize('xs')).toBe('extra-small');
    expect(normalizeFontSize('extra-small')).toBe('extra-small');
    expect(normalizeFontSize('extrasmall')).toBe('extra-small');

    expect(normalizeFontSize('sm')).toBe('small');
    expect(normalizeFontSize('small')).toBe('small');

    expect(normalizeFontSize('md')).toBe('default');
    expect(normalizeFontSize('medium')).toBe('default');
    expect(normalizeFontSize('base')).toBe('default');
    expect(normalizeFontSize('default')).toBe('default');
    expect(normalizeFontSize(undefined)).toBe('default');
    expect(normalizeFontSize(null)).toBe('default');

    expect(normalizeFontSize('lg')).toBe('large');
    expect(normalizeFontSize('large')).toBe('large');

    expect(normalizeFontSize('xl')).toBe('extra-large');
    expect(normalizeFontSize('extra-large')).toBe('extra-large');
  });

  it('applies font size to documentElement attribute, style, and localStorage', () => {
    const applied = applyFontSize('large');
    expect(applied).toBe('large');
    expect(document.documentElement.getAttribute('data-font-size')).toBe('large');
    expect(document.documentElement.style.fontSize).toBe('112.5%');
    expect(localStorage.getItem(STORAGE_KEY_FONT_SIZE)).toBe('large');
  });

  it('retrieves stored font size from localStorage', () => {
    localStorage.setItem(STORAGE_KEY_FONT_SIZE, 'extra-large');
    expect(getStoredFontSize()).toBe('extra-large');
  });

  it('falls back to default if stored value is missing or invalid', () => {
    expect(getStoredFontSize()).toBe('default');
    localStorage.setItem(STORAGE_KEY_FONT_SIZE, 'invalid-size');
    expect(getStoredFontSize()).toBe('default');
  });
});
