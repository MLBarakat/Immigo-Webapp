import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountSettingsPage } from '../AccountSettingsPage';
import { AuthContext } from '../../context/authContextTypes';
import type { AuthContextType } from '../../context/authContextTypes';

const baseAuth: AuthContextType = {
  session: null,
  user: { id: 'user-1', email: 'user@example.com', user_metadata: {} } as AuthContextType['user'],
  profile: { id: 'user-1', full_name: 'Old Name', language: 'en-US', created_at: '', updated_at: '' },
  loading: false,
  initializationError: null,
  retryInitialization: vi.fn(),
  userSettings: {
    language: 'en-US',
    theme: 'system',
    ai_voice_id: 'Joanna',
    live_feedback_enabled: true,
    mic_mode: 'voice_activity',
    barge_in: 'balanced',
    progress_report_frequency: 'after_session',
    font_size: 'default',
  },
  login: vi.fn(),
  signUp: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  updatePassword: vi.fn().mockResolvedValue(undefined),
  updateUserSettings: vi.fn().mockResolvedValue(undefined),
  updateUserLanguage: vi.fn().mockResolvedValue(undefined),
};

function renderPage(overrides: Partial<AuthContextType> = {}) {
  const value = { ...baseAuth, ...overrides };
  return render(
    <AuthContext.Provider value={value}>
      <AccountSettingsPage onNavigateBack={vi.fn()} isDesktop />
    </AuthContext.Provider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AccountSettingsPage', () => {
  it('persists a changed profile name', async () => {
    const updateProfile = vi.fn().mockResolvedValue(undefined);
    renderPage({ updateProfile });

    const nameInput = screen.getByLabelText('Full Name');
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith('New Name'));
    expect(screen.getByRole('status').textContent).toContain('Profile saved.');
  });

  it('rejects mismatched passwords before calling auth', async () => {
    const updatePassword = vi.fn().mockResolvedValue(undefined);
    renderPage({ updatePassword });
    fireEvent.click(screen.getAllByRole('button', { name: 'Security & Login' })[0]);

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password-one' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'password-two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    expect(updatePassword).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Passwords do not match.');
  });
});
