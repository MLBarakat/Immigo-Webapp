import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider } from '../AuthContext';
import { useAuth } from '../../hooks/useAuth';

const { getSupabaseClientMock, loggerMock } = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn(),
  loggerMock: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../supabaseClient', () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

vi.mock('../../../analytics', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

vi.mock('../../../logger', () => ({
  logger: loggerMock,
}));

function createSession(userId: string): Session {
  return {
    access_token: `token-${userId}`,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    expires_at: 9999999999,
    token_type: 'bearer',
    user: { id: userId } as Session['user'],
  };
}

function createSupabaseMock(initialSession: Session | null = null) {
  const authStateHandlers: Array<(event: string, session: Session | null) => void> = [];
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: initialSession }, error: null }),
      onAuthStateChange: vi.fn((handler: (event: string, session: Session | null) => void) => {
        authStateHandlers.push(handler);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  };

  return { client, authStateHandlers };
}

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <AuthProvider>{children}</AuthProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuthProvider', () => {
  it('exposes a retryable initialization error when Supabase setup fails', async () => {
    const supabase = createSupabaseMock();
    getSupabaseClientMock
      .mockRejectedValueOnce(new Error('missing configuration'))
      .mockResolvedValueOnce(supabase.client);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.initializationError).toBeTruthy());
    expect(result.current.loading).toBe(false);

    act(() => result.current.retryInitialization());

    await waitFor(() => expect(getSupabaseClientMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.initializationError).toBe(null));
  });

  it('keeps the newest profile when an older profile request resolves later', async () => {
    const sessionA = createSession('user-a');
    const sessionB = createSession('user-b');
    const profileA = { id: 'user-a', full_name: 'User A', language: 'en-US', created_at: '', updated_at: '' };
    const profileB = { id: 'user-b', full_name: 'User B', language: 'en-US', created_at: '', updated_at: '' };
    let resolveProfileA: ((value: { data: typeof profileA; error: null }) => void) | undefined;
    let resolveProfileB: ((value: { data: typeof profileB; error: null }) => void) | undefined;
    const profilePromiseA = new Promise<{ data: typeof profileA; error: null }>((resolve) => { resolveProfileA = resolve; });
    const profilePromiseB = new Promise<{ data: typeof profileB; error: null }>((resolve) => { resolveProfileB = resolve; });
    const supabase = createSupabaseMock(sessionA);

    supabase.client.from.mockImplementation((_table: string) => {
      const query = {
        select: () => query,
        eq: (_column: string, userId: string) => ({
          single: () => userId === 'user-a' ? profilePromiseA : profilePromiseB,
        }),
      };
      return query;
    });
    getSupabaseClientMock.mockResolvedValue(supabase.client);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(supabase.client.auth.onAuthStateChange).toHaveBeenCalled());

    act(() => {
      supabase.client.auth.onAuthStateChange.mock.calls[0][0]('SIGNED_IN', sessionB);
    });
    resolveProfileB?.({ data: profileB, error: null });
    await waitFor(() => expect(result.current.profile?.id).toBe('user-b'));

    resolveProfileA?.({ data: profileA, error: null });
    await act(async () => { await profilePromiseA; });
    expect(result.current.profile?.id).toBe('user-b');
  });

  it('persists profile, password, and settings changes through Supabase', async () => {
    const session = createSession('user-a');
    const supabase = createSupabaseMock(session);
    const profile = { id: 'user-a', full_name: 'New Name', language: 'en-US', created_at: '', updated_at: '' };
    const profileQuery = {
      select: () => profileQuery,
      eq: () => profileQuery,
      single: vi.fn().mockResolvedValue({ data: profile, error: null }),
      update: vi.fn(() => profileQuery),
    };
    supabase.client.from.mockReturnValue(profileQuery);
    supabase.client.auth.updateUser = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ data: { user: session.user }, error: null });
    getSupabaseClientMock.mockResolvedValue(supabase.client);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('user-a'));

    await act(async () => {
      await result.current.updateProfile('New Name');
      await result.current.updatePassword('new-password');
      await result.current.updateUserSettings({ font_size: 'large' });
    });

    expect(profileQuery.update).toHaveBeenCalledWith({ full_name: 'New Name' });
    expect(supabase.client.auth.updateUser).toHaveBeenNthCalledWith(1, { password: 'new-password' });
    expect(supabase.client.auth.updateUser).toHaveBeenNthCalledWith(2, {
      data: { settings: expect.objectContaining({ font_size: 'large' }) },
    });
  });

  it('persists language changes to user_settings, profile, metadata, and context cache', async () => {
    const session = createSession('user-a');
    const supabase = createSupabaseMock(session);
    const profile = { id: 'user-a', full_name: 'User A', language: 'en-US', created_at: '', updated_at: '' };
    const settingsRow = {
      user_id: 'user-a',
      language: 'en-US',
      theme: 'system',
      ai_voice_id: 'Joanna',
      live_feedback_enabled: true,
      mic_mode: 'voice_activity',
      barge_in: 'balanced',
      progress_report_frequency: 'after_session',
      font_size: 'default',
      has_seen_welcome: false,
      updated_at: '',
    };
    const userSettingsUpsert = vi.fn().mockResolvedValue({ error: null });
    const profileUpdate = vi.fn(() => profileQuery);
    const profileEqAfterUpdate = vi.fn().mockResolvedValue({ error: null });
    const profileQuery = {
      select: () => profileQuery,
      eq: vi.fn((_column: string, _value: string) => profileQuery),
      single: vi.fn().mockResolvedValue({ data: profile, error: null }),
      update: profileUpdate,
    };
    profileQuery.eq.mockImplementation(() => profileQuery);
    profileUpdate.mockImplementation(() => ({ eq: profileEqAfterUpdate }));

    const userSettingsQuery = {
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: settingsRow, error: null }),
        }),
      }),
      upsert: userSettingsUpsert,
    };

    supabase.client.from.mockImplementation((table: string) => (
      table === 'user_settings' ? userSettingsQuery : profileQuery
    ));
    supabase.client.auth.updateUser = vi.fn().mockResolvedValue({ data: { user: session.user }, error: null });
    getSupabaseClientMock.mockResolvedValue(supabase.client);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('user-a'));
    await waitFor(() => expect(result.current.userSettings.language).toBe('en-US'));

    await act(async () => {
      await result.current.updateUserLanguage('es-ES');
    });

    expect(result.current.userSettings.language).toBe('es-ES');
    expect(userSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-a', language: 'es-ES' }),
      { onConflict: 'user_id' },
    );
    expect(profileUpdate).toHaveBeenCalledWith({ language: 'es-ES' });
    expect(supabase.client.auth.updateUser).toHaveBeenCalledWith({
      data: { settings: expect.objectContaining({ language: 'es-ES' }) },
    });
  });
});
