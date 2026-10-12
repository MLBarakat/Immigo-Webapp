import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationSettingsModal } from '../ApplicationSettingsModal';
import { DEFAULT_USER_SETTINGS } from '../../types/settings';

function renderSettings(isDesktop: boolean) {
  const onThemePreview = vi.fn();
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <ApplicationSettingsModal
      isOpen
      onClose={onClose}
      settings={DEFAULT_USER_SETTINGS}
      onSave={onSave}
      onThemePreview={onThemePreview}
      pollyVoices={[]}
      isDesktop={isDesktop}
    />
  );
  return { onThemePreview, onClose, onSave };
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

describe('ApplicationSettingsModal', () => {
  it('previews the selected appearance immediately', () => {
    const { onThemePreview, onClose, onSave } = renderSettings(false);

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(onThemePreview).toHaveBeenLastCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(onThemePreview).toHaveBeenLastCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers only Light and Dark and commits the selected theme only on Save', async () => {
    const { onSave, onThemePreview, onClose } = renderSettings(true);
    const lightOption = screen.getByRole('radio', { name: 'Light' });
    const darkOption = screen.getByRole('radio', { name: 'Dark' });

    expect(screen.queryByRole('radio', { name: 'System' })).toBeNull();
    expect(lightOption.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(darkOption);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(darkOption.getAttribute('aria-checked')).toBe('true');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].theme).toBe('dark');
    expect(onThemePreview).toHaveBeenLastCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Text Size on mobile but not on desktop', () => {
    const { unmount } = render(
      <ApplicationSettingsModal
        isOpen
        onClose={vi.fn()}
        settings={DEFAULT_USER_SETTINGS}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onThemePreview={vi.fn()}
        pollyVoices={[]}
        isDesktop
      />
    );
    expect(screen.queryByText('Text Size')).toBeNull();

    unmount();
    renderSettings(false);

    expect(screen.getByText('Text Size')).toBeDefined();
  });
});
