import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { Footer } from '../Footer';

describe('Footer Component (LEG-01 Disclaimers)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders non-affiliation legal disclaimer and action links', () => {
    render(<Footer />);

    expect(
      screen.getByText(/ImmiGO is not affiliated with USCIS and does not provide a legal advice\./i)
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Terms' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Privacy' })).toBeDefined();
  });

  it('keeps legal links and a compact disclaimer in a single mobile footer row', () => {
    const { container } = render(<Footer />);
    const footerRow = container.querySelector('footer > div');
    const disclaimer = screen.getByText(/ImmiGO is not affiliated with USCIS/i);

    expect(footerRow?.className).toContain('flex-row');
    expect(disclaimer.className).toContain('truncate');
  });

  it('makes the disclaimer focusable so it can be revealed on mobile', () => {
    render(<Footer />);

    const disclaimer = screen.getByText(/ImmiGO is not affiliated with USCIS/i);
    expect(disclaimer.getAttribute('tabindex')).toBe('0');
    expect(disclaimer.getAttribute('title')).toContain('ImmiGO is not affiliated with USCIS');
  });

  it('uses the Immigo navy background with readable foreground colors', () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector('footer');

    expect(footer?.className).toContain('bg-deep-navy');
    expect(footer?.className).toContain('text-star-white');
    expect(screen.getByText(/ImmiGO is not affiliated with USCIS/i).className).toContain('text-immigo-gray-300');
  });

  it('opens and closes Terms modal on click', () => {
    render(<Footer />);

    const termsBtn = screen.getByRole('button', { name: 'Terms' });
    fireEvent.click(termsBtn);

    expect(screen.getByRole('dialog', { name: /Terms and Conditions/i })).toBeDefined();

    const closeBtn = screen.getByRole('button', { name: /Close terms and conditions/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog', { name: /Terms and Conditions/i })).toBeNull();
  });

  it('opens and closes Privacy modal on click', () => {
    render(<Footer />);

    const privacyBtn = screen.getByRole('button', { name: 'Privacy' });
    fireEvent.click(privacyBtn);

    expect(screen.getByRole('dialog', { name: /Privacy Policy/i })).toBeDefined();

    const closeBtn = screen.getByRole('button', { name: /Close privacy policy/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog', { name: /Privacy Policy/i })).toBeNull();
  });
});
