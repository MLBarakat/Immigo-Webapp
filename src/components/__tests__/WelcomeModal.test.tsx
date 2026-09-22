import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WelcomeModal } from '../WelcomeModal';

afterEach(() => {
  cleanup();
});

describe('WelcomeModal Component', () => {
  it('renders welcome header with user name and initial step', () => {
    render(<WelcomeModal userName="Alex" onClose={vi.fn()} />);

    expect(screen.getByText('Welcome, Alex!')).toBeDefined();
    expect(screen.getByText('Start Your Session')).toBeDefined();
    expect(screen.getByRole('button', { name: /next/i })).toBeDefined();
  });

  it('steps through all onboarding tips and calls onClose on final step', () => {
    const handleClose = vi.fn();
    render(<WelcomeModal userName="Alex" onClose={handleClose} />);

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Speak Naturally')).toBeDefined();

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Pro Tip: Interrupt Anytime!')).toBeDefined();

    // Final step button changes to "Let's Get Started"
    const startBtn = screen.getByRole('button', { name: /let's get started/i });
    expect(startBtn).toBeDefined();

    fireEvent.click(startBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close icon is clicked', () => {
    const handleClose = vi.fn();
    render(<WelcomeModal userName="Alex" onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: /close welcome message|close/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
