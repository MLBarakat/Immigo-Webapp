import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationSettingsModal } from '../ApplicationSettingsModal';
import { DEFAULT_USER_SETTINGS } from '../../types/settings';

function renderSettings(isDesktop: boolean) {
  const onThemePreview = vi.fn();
  const onClose = vi.fn();
  render(
    <ApplicationSettingsModal
      isOpen
      onClose={onClose}
      settings={DEFAULT_USER_SETTINGS}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onThemePreview={onThemePreview}
      pollyVoices={[]}
      isDesktop={isDesktop}
    />
  );
  return { onThemePreview, onClose };
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

describe('ApplicationSettingsModal', () => {
  it('previews the selected appearance immediately', () => {
    const { onThemePreview, onClose } = renderSettings(false);

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(onThemePreview).toHaveBeenLastCalledWith('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
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
