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
      screen.getByText(/ImmiGO is an independent educational tool not affiliated with USCIS/i)
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Terms' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Privacy' })).toBeDefined();
  });

  it('keeps legal links and a compact disclaimer in a single mobile footer row', () => {
    const { container } = render(<Footer />);
    const footerRow = container.querySelector('footer > div');
    const disclaimer = screen.getByText(/ImmiGO is an independent educational tool/i);

    expect(footerRow?.className).toContain('flex-row');
    expect(disclaimer.className).toContain('truncate');
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
