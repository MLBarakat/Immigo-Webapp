import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusOnboardingCard } from '../FocusOnboardingCard';

afterEach(() => {
  cleanup();
});

function chooseFocus(name: string) {
  fireEvent.focus(screen.getByRole('combobox'));
  const option = screen.getByRole('option', { name });
  const button = option.querySelector('button');
  if (!button) throw new Error(`Option "${name}" has no button`);
  fireEvent.click(button);
}

describe('FocusOnboardingCard', () => {
  it('pre-fills the saved goal and submits the narrowed focus', () => {
    const onSubmit = vi.fn();
    render(
      <FocusOnboardingCard
        mode="practice"
        testVersion="2020"
        initialGoal="Rights and Responsibilities"
        submitting={false}
        error={null}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Choose your focus' })).toBeDefined();
    expect(screen.getByText(/Pick the areas you want to strengthen/)).toBeDefined();

    fireEvent.focus(screen.getByRole('combobox'));
    expect(
      screen.getByRole('option', { name: 'Rights and Responsibilities' })
        .getAttribute('aria-selected'),
    ).toBe('true');

    chooseFocus('Geography');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSubmit).toHaveBeenCalledWith({
      selectedIds: ['rights-and-responsibilities', 'geography'],
      allFocusAreas: false,
    });
  });

  it('defaults a hand-written goal to All focus areas and still requires Continue', () => {
    const onSubmit = vi.fn();
    render(
      <FocusOnboardingCard
        mode="study"
        testVersion="2020"
        initialGoal="Practice with my neighbour"
        submitting={false}
        error={null}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText(/Pick the areas you want to study/)).toBeDefined();
    expect(screen.getByText('All focus areas')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSubmit).toHaveBeenCalledWith({ selectedIds: [], allFocusAreas: true });
  });

  it('disables the card while submitting and shows a save error', () => {
    const { rerender } = render(
      <FocusOnboardingCard
        mode="practice"
        testVersion="2008"
        initialGoal={null}
        submitting
        error={null}
        onSubmit={vi.fn()}
      />,
    );

    const submittingButton = screen.getByRole('button', { name: /Starting/ }) as HTMLButtonElement;
    expect(submittingButton.disabled).toBe(true);
    expect(screen.getByRole('combobox').getAttribute('disabled')).not.toBeNull();

    rerender(
      <FocusOnboardingCard
        mode="practice"
        testVersion="2008"
        initialGoal={null}
        submitting={false}
        error="Your focus could not be saved. Please try again."
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('could not be saved');
    // The 2008 bank labels its 1800s category with the article.
    chooseFocus('The 1800s');
    expect(
      screen.getByRole('option', { name: 'The 1800s' }).getAttribute('aria-selected'),
    ).toBe('true');
  });
});
