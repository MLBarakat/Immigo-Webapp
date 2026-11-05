import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationSettingsModal } from '../ApplicationSettingsModal';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '../../types/settings';

function renderSettings(isDesktop: boolean, settings: Partial<UserSettings> = DEFAULT_USER_SETTINGS) {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onVoicePreview = vi.fn();
  render(
    <ApplicationSettingsModal
      isOpen
      onClose={onClose}
      settings={settings}
      onSave={onSave}
      onVoicePreview={onVoicePreview}
      isDesktop={isDesktop}
    />
  );
  return { onClose, onSave, onVoicePreview };
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

describe('ApplicationSettingsModal', () => {
  it('applies and persists appearance changes immediately with no Save or Cancel action', async () => {
    const { onClose, onSave } = renderSettings(true);

    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].theme).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers exactly the two voices for the selected language and previews a newly selected voice', async () => {
    const { onSave, onVoicePreview } = renderSettings(true);
    const voiceSelect = screen.getByRole('combobox', { name: 'AI Voice' });

    expect(within(voiceSelect).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Ruth (Female)', 'Matthew (Male)']);

    fireEvent.change(voiceSelect, { target: { value: 'Matthew' } });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].ai_voice_id).toBe('Matthew');
    expect(onVoicePreview).toHaveBeenCalledWith('Matthew', 'en-US', 'Matthew');
  });

  it('persists rapid changes in order without losing the latest choices', async () => {
    const { onSave } = renderSettings(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Live Feedback' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0]).toMatchObject({
      theme: 'dark',
      live_feedback_enabled: false,
    });
  });

  it('shows an inline error and keeps the chosen value when auto-save fails', async () => {
    render(
      <ApplicationSettingsModal
        isOpen
        onClose={vi.fn()}
        settings={DEFAULT_USER_SETTINGS}
        onSave={vi.fn().mockRejectedValue(new Error('offline'))}
        onVoicePreview={vi.fn()}
        isDesktop
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect((await screen.findByRole('alert')).textContent).toBe('offline');
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
  });

  it('switches to the default voice for a newly selected language', async () => {
    const { onSave, onVoicePreview } = renderSettings(false);

    fireEvent.click(screen.getByRole('button', { name: 'Select Language' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Español/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ language: 'es-ES', ai_voice_id: 'Mia' });
    expect(onVoicePreview).not.toHaveBeenCalled();

    const voiceSelect = screen.getByRole('combobox', { name: 'AI Voice' });
    expect(within(voiceSelect).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Mía (Femenino)', 'Andrés (Masculino)']);
  });

  it('shows Text Size on mobile but not on desktop', () => {
    const { unmount } = render(
      <ApplicationSettingsModal
        isOpen
        onClose={vi.fn()}
        settings={DEFAULT_USER_SETTINGS}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onVoicePreview={vi.fn()}
        isDesktop
      />
    );
    expect(screen.queryByText('Text Size')).toBeNull();

    unmount();
    renderSettings(false);

    expect(screen.getByText('Text Size')).toBeDefined();
  });

  it('no longer edits learning goals and omits them from every auto-save payload', async () => {
    const { onSave } = renderSettings(false);

    expect(screen.queryByText('Learning Goals')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Learning focus' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Weekly graded-answer target' })).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Live Feedback' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].live_feedback_enabled).toBe(false);
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('learning_goal');
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('weekly_graded_answer_target');
  });
});
