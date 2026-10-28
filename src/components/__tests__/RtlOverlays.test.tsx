import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { TermsModal } from '../TermsModal';
import { PrivacyModal } from '../PrivacyModal';
import { SubscriptionModal } from '../SubscriptionModal';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en-US');
});

describe('Arabic RTL overlays', () => {
  it('renders the terms dialog RTL while keeping the legal body direction automatic', async () => {
    await i18n.changeLanguage('ar-SA');
    const onClose = vi.fn();

    render(<TermsModal onClose={onClose} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('dir')).toBe('rtl');
    expect(dialog.querySelector('main')?.getAttribute('dir')).toBe('auto');
    expect(screen.getByRole('heading', { name: 'الشروط والأحكام' })).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the privacy dialog RTL while keeping the legal body direction automatic', async () => {
    await i18n.changeLanguage('ar-SA');

    render(<PrivacyModal onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('dir')).toBe('rtl');
    expect(dialog.querySelector('main')?.getAttribute('dir')).toBe('auto');
    expect(screen.getByRole('heading', { name: 'سياسة الخصوصية' })).toBeDefined();
  });

  it('renders the subscription dialog RTL and closes on Escape', async () => {
    await i18n.changeLanguage('ar-SA');
    const onClose = vi.fn();

    render(<SubscriptionModal isOpen onClose={onClose} />);

    expect(screen.getByRole('dialog').getAttribute('dir')).toBe('rtl');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useFocusTrap behavior through rendered dialogs', () => {
  it('wraps focus within the terms dialog', async () => {
    render(<TermsModal onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    const headerCloseButton = screen.getByRole('button', { name: /close terms and conditions/i });
    const footerCloseButton = screen.getByRole('button', { name: 'Close' });

    await waitFor(() => expect(document.activeElement).toBe(headerCloseButton));

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(footerCloseButton);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(headerCloseButton);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
