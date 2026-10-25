import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileMenuOverlay } from '../MobileMenuOverlay';

function renderMenu() {
  const handlers = {
    onClose: vi.fn(),
    onOpenAppSettings: vi.fn(),
    onOpenAccountSettings: vi.fn(),
    onManageSubscription: vi.fn(),
    onOpenHelpSupport: vi.fn(),
    onOpenInviteFriends: vi.fn(),
    onSignOut: vi.fn(),
  };

  render(
    <MobileMenuOverlay
      isOpen
      {...handlers}
      user={{ name: 'Ada Lovelace', initials: 'AL' }}
    />
  );

  return handlers;
}

afterEach(() => {
  cleanup();
});

describe('MobileMenuOverlay', () => {
  it('keeps the approved menu structure and plan badge', () => {
    renderMenu();

    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Account Settings/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Application Settings' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Manage Subscription/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Help & Support' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Invite a Friend' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeDefined();
    expect(screen.getByText('Free')).toBeDefined();
    expect(screen.getByRole('separator')).toBeDefined();
    expect(screen.queryByText('Preferences')).toBeNull();
  });

  it('opens Help & Support and closes the menu', () => {
    const handlers = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Help & Support' }));

    expect(handlers.onOpenHelpSupport).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the invite flow and signs out from the footer', () => {
    const handlers = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Invite a Friend' }));
    expect(handlers.onOpenInviteFriends).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(handlers.onSignOut).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(2);
  });
});
