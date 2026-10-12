import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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

  it('drags the dialog by its header without blocking the close button', async () => {
    const handleClose = vi.fn();
    render(<WelcomeModal userName="Alex" onClose={handleClose} />);

    const dialog = screen.getByText('Welcome, Alex!').closest('.bg-star-white') as HTMLDivElement;
    const header = screen.getByText('Welcome, Alex!').closest('header') as HTMLElement;
    const closeButton = screen.getByRole('button', { name: /close welcome message|close/i });
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 100, left: 100, top: 100, right: 400, bottom: 300, width: 300, height: 200,
      toJSON: () => ({}),
    });
    header.setPointerCapture = vi.fn();
    header.hasPointerCapture = vi.fn().mockReturnValue(true);
    header.releasePointerCapture = vi.fn();

    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      isPrimary: boolean;

      constructor(type: string, init: MouseEventInit & { pointerId?: number; isPrimary?: boolean } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: TestPointerEvent });

    const dispatchPointerEvent = (type: string, properties: Record<string, number | boolean>) => {
      const event = new window.PointerEvent(type, { bubbles: true, ...properties } as PointerEventInit);
      fireEvent(header, event);
    };
    dispatchPointerEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 150, clientY: 150 });
    dispatchPointerEvent('pointermove', { pointerId: 1, clientX: 190, clientY: 180 });

    expect(header.setPointerCapture).toHaveBeenCalledWith(1);
    await waitFor(() => expect(dialog.style.translate).toBe('40px 30px'));
    dispatchPointerEvent('pointerup', { pointerId: 1 });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
