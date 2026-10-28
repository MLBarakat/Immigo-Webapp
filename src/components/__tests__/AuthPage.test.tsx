import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthPage } from '../AuthPage';
import { AuthContext } from '../../context/authContextTypes';
import type { AuthContextType } from '../../context/authContextTypes';

const auth: AuthContextType = {
  session: null,
  user: null,
  profile: null,
  loading: false,
  initializationError: null,
  sessionReplacementPending: false,
  sessionReplacementError: null,
  retryInitialization: vi.fn(),
  logoutReplacedSession: vi.fn(),
  userSettings: {
    language: 'en-US', theme: 'light', live_feedback_enabled: true,
    mic_mode: 'voice_activity', barge_in: 'balanced', progress_report_frequency: 'after_session',
  },
  login: vi.fn(),
  signUp: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  updatePassword: vi.fn(),
  updateUserSettings: vi.fn(),
  updateUserLanguage: vi.fn(),
};

describe('AuthPage registration location', () => {
  it('requires a U.S. state and lists all 50 states', () => {
    render(<AuthContext.Provider value={auth}><AuthPage /></AuthContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const stateSelect = screen.getByTestId('auth-location-state') as HTMLSelectElement;
    expect(stateSelect.required).toBe(true);
    expect(stateSelect.options).toHaveLength(51); // Placeholder plus all states.
  });
});
