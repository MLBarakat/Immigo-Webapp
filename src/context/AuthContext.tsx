import { useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import { Session, User, SupabaseClient, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabaseClient';
import { UserProfile } from '../types/profile';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../types/settings';
import { applyFontSize, getStoredFontSize } from '../utils/fontSize';
import { analytics } from '../analytics';
import { logger } from '../logger';
import { AuthContext, SignUpPayload } from './authContextTypes';
import { UserSettingsService, userSettingsRowToSettings } from '../services/userSettingsService';
import type { UserSettingsRow } from '../services/userSettingsService';
import { normalizeTheme } from '../utils/theme';

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [sessionReplacementPending, setSessionReplacementPending] = useState(false);
  const [sessionReplacementError, setSessionReplacementError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => ({
    ...DEFAULT_USER_SETTINGS,
    font_size: getStoredFontSize(),
  }));
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const sessionLoadGenerationRef = useRef(0);
  const settingsRealtimeGenerationRef = useRef(0);
  const profileRealtimeGenerationRef = useRef(0);
  const replacementTimerRef = useRef<number | null>(null);
  const replacementHandledRef = useRef(false);
  const activeDeviceIdRef = useRef<string | null>(null);
  const ownershipCheckInProgressRef = useRef(false);

  const logoutReplacedSession = useCallback(async (): Promise<void> => {
    if (!supabase) throw new Error('Supabase client not initialized.');
    if (replacementTimerRef.current !== null) {
      window.clearTimeout(replacementTimerRef.current);
      replacementTimerRef.current = null;
    }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      setSessionReplacementError('Sign-out could not be completed. Please try again.');
      logger.error('Could not sign out a replaced device session.', { error: error.message });
      throw error;
    }
    replacementHandledRef.current = false;
    setSessionReplacementPending(false);
    setSessionReplacementError(null);
    analytics.track('user_logout', { reason: 'concurrent_device_login' });
  }, [supabase]);

  const handleSessionReplacement = useCallback(() => {
    if (replacementHandledRef.current) return;
    replacementHandledRef.current = true;
    setSessionReplacementError(null);
    setSessionReplacementPending(true);
    logger.warn('A different device claimed the active user session; signing out this device shortly.');
    replacementTimerRef.current = window.setTimeout(() => {
      void logoutReplacedSession().catch(() => {
        setSessionReplacementError('Sign-out could not be completed. Please try again.');
      });
    }, 6_000);
  }, [logoutReplacedSession]);

  useEffect(() => {
    applyFontSize(userSettings.font_size);
  }, [userSettings.font_size]);

  useEffect(() => {
    let cancelled = false;

    const initializeSupabase = async () => {
      try {
        const client = await getSupabaseClient();
        if (cancelled) return;
        setInitializationError(null);
        setSupabase(client);
      } catch {
        if (cancelled) return;
        setInitializationError('The authentication service is unavailable. Check your configuration and try again.');
        setLoading(false);
      }
    };

    initializeSupabase();

    return () => {
      cancelled = true;
    };
  }, [initializationAttempt]);

  const retryInitialization = useCallback(() => {
    setSupabase(null);
    setSession(null);
    setUser(null);
    setProfile(null);
    setUserSettings(DEFAULT_USER_SETTINGS);
    setInitializationError(null);
    setLoading(true);
    setInitializationAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    const loadSessionAndProfile = async (currentSession: Session | null): Promise<void> => {
      const generation = ++sessionLoadGenerationRef.current;
      const settingsRealtimeGeneration = settingsRealtimeGenerationRef.current;
      const profileRealtimeGeneration = profileRealtimeGenerationRef.current;
      const currentUser = currentSession?.user ?? null;

      setSession(currentSession);
      setUser(currentUser);
      setProfile(null);

      // Merge settings: Supabase user_metadata takes priority over defaults.
      // For font_size, fall back to localStorage only if Supabase has no value.
      const remoteSettings = (currentUser?.user_metadata?.settings as Partial<UserSettings> | undefined) ?? {};
      const mergedSettings: UserSettings = {
        ...DEFAULT_USER_SETTINGS,
        ...remoteSettings,
        theme: normalizeTheme(remoteSettings.theme),
        font_size: remoteSettings.font_size ?? getStoredFontSize(),
      };
      setUserSettings(mergedSettings);
      setLoading(true);

      if (!currentUser) {
        if (!cancelled && generation === sessionLoadGenerationRef.current) {
          setLoading(false);
        }
        return;
      }

      try {
        // Fetch profile and user_settings in parallel to minimise latency.
        const [profileResult, dbSettings] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', currentUser.id).single(),
          UserSettingsService.fetchSettings(supabase, currentUser.id),
        ]);

        if (cancelled || generation !== sessionLoadGenerationRef.current) return;

        if (profileRealtimeGenerationRef.current === profileRealtimeGeneration) {
          if (profileResult.error) {
            setProfile(null);
            logger.error('Error fetching user profile.', { error: profileResult.error.message, userId: currentUser.id });
          } else {
            setProfile(profileResult.data);
            if (!remoteSettings.language && profileResult.data?.language) {
              mergedSettings.language = profileResult.data.language;
            }
          }
        }

        if (settingsRealtimeGenerationRef.current === settingsRealtimeGeneration) {
          if (dbSettings) {
            // DB row exists → use it as the highest-priority source.
            setUserSettings(prev => ({
              ...prev,
              ...dbSettings,
              // Always prefer the DB font_size; fall back to localStorage only if DB has none.
              font_size: dbSettings.font_size ?? prev.font_size,
            }));
          } else {
            // No row yet → upsert defaults so the record exists for next time.
            logger.info('No user_settings row found; creating defaults.', { userId: currentUser.id });
            setUserSettings(prev => ({
              ...prev,
              ...mergedSettings,
              font_size: mergedSettings.font_size ?? prev.font_size,
            }));
            void UserSettingsService.upsertSettings(supabase, currentUser.id, mergedSettings);
          }
        }
      } catch (err) {
        if (cancelled || generation !== sessionLoadGenerationRef.current) return;
        setProfile(null);
        logger.error('Error in session/profile fetch.', { error: String(err) });
      } finally {
        if (!cancelled && generation === sessionLoadGenerationRef.current) {
          setLoading(false);
        }
      }
    };

    const initializeSession = async (): Promise<void> => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        if (error) throw error;
        await loadSessionAndProfile(currentSession);
      } catch (err) {
        if (cancelled) return;
        logger.error('Error initializing auth session.', { error: String(err) });
        setLoading(false);
      }
    };
    initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, newSession: Session | null) => {
      if (event === 'USER_UPDATED') {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        // Merge incoming settings rather than wholesale replacing, so in-flight
        // optimistic updates (e.g. font_size) are not clobbered.
        if (newSession?.user?.user_metadata?.settings) {
          setUserSettings(prev => ({
            ...prev,
            ...(newSession.user.user_metadata.settings as Partial<UserSettings>),
          }));
        }
        return;
      }
      if (event === 'TOKEN_REFRESHED') {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        return;
      }
      void loadSessionAndProfile(newSession);
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user?.id) return;

    const channel = supabase
      .channel(`user-session-sync-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${user.id}` },
        (payload) => {
          settingsRealtimeGenerationRef.current += 1;
          if (payload.eventType === 'DELETE') {
            setUserSettings(DEFAULT_USER_SETTINGS);
            return;
          }
          setUserSettings((current) => ({
            ...current,
            ...userSettingsRowToSettings(payload.new as UserSettingsRow),
          }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          profileRealtimeGenerationRef.current += 1;
          if (payload.eventType === 'DELETE') {
            setProfile(null);
            return;
          }
          setProfile(payload.new as UserProfile);
        },
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.error('Realtime session synchronization failed.', {
            userId: user.id,
            status,
            error: error?.message,
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      activeDeviceIdRef.current = null;
      replacementHandledRef.current = false;
      if (replacementTimerRef.current !== null) {
        window.clearTimeout(replacementTimerRef.current);
        replacementTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const deviceStorageKey = 'immigo_active_device_id';
    let deviceId: string;
    try {
      const storedDeviceId = localStorage.getItem(deviceStorageKey);
      deviceId = storedDeviceId || crypto.randomUUID();
      if (!storedDeviceId) localStorage.setItem(deviceStorageKey, deviceId);
      activeDeviceIdRef.current = deviceId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Unable to establish a persistent device identifier for session enforcement.', {
        userId: user.id,
        error: message,
      });
      queueMicrotask(() => {
        if (cancelled) return;
        setInitializationError('This device could not be verified for secure sign-in. Please enable local storage and try again.');
        void supabase.auth.signOut({ scope: 'local' }).then(({ error: signOutError }) => {
          if (signOutError) {
            logger.error('Could not sign out after device verification failed.', {
              userId: user.id,
              error: signOutError.message,
            });
          }
        }).catch((signOutError: unknown) => {
          logger.error('Could not sign out after device verification failed.', {
            userId: user.id,
            error: signOutError instanceof Error ? signOutError.message : String(signOutError),
          });
        });
      });
      return () => {
        cancelled = true;
      };
    }

    const checkOwnership = async (claim: boolean): Promise<void> => {
      if (ownershipCheckInProgressRef.current || cancelled) return;
      ownershipCheckInProgressRef.current = true;
      try {
        if (claim) {
          const { error: claimError } = await supabase
            .from('active_user_sessions')
            .upsert(
              { user_id: user.id, device_id: deviceId, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' },
            );
          if (claimError) throw claimError;
        }

        const { data, error } = await supabase
          .from('active_user_sessions')
          .select('device_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled && data?.device_id !== deviceId) handleSessionReplacement();
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Active device session ownership could not be verified.', {
          userId: user.id,
          error: message,
        });
        setInitializationError('Secure session verification failed. Please sign out and try again.');
      } finally {
        ownershipCheckInProgressRef.current = false;
      }
    };

    const channel = supabase
      .channel(`active-user-session-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_user_sessions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const replacementDeviceId = (payload.new as { device_id?: unknown } | null)?.device_id;
          if (typeof replacementDeviceId === 'string' && replacementDeviceId !== deviceId) {
            handleSessionReplacement();
          }
        },
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.error('Active device session realtime monitoring failed; periodic ownership checks remain enabled.', {
            userId: user.id,
            status,
            error: error?.message,
          });
        }
      });

    void checkOwnership(true);
    const ownershipTimer = window.setInterval(() => {
      if (!document.hidden) void checkOwnership(false);
    }, 20_000);
    const handleVisibilityChange = () => {
      if (!document.hidden) void checkOwnership(false);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(ownershipTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [supabase, user?.id, handleSessionReplacement]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    if (!supabase) throw new Error("Supabase client not initialized.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    analytics.track('user_login', { method: 'email' });
  }, [supabase]);

  const signUp = useCallback(async ({ email, password, fullName, language, termsAcceptedAt, termsVersion, privacyVersion }: SignUpPayload): Promise<void> => {
    if (!supabase) throw new Error("Supabase client not initialized.");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, language, terms_accepted_at: termsAcceptedAt, terms_version: termsVersion, privacy_version: privacyVersion } },
    });
    if (error) throw error;

    analytics.track('user_signup', { method: 'email', language });
  }, [supabase]);

  const logout = useCallback(async (): Promise<void> => {
    if (!supabase) throw new Error("Supabase client not initialized.");
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    analytics.track('user_logout');
  }, [supabase]);

  const updateProfile = useCallback(async (fullName: string): Promise<void> => {
    if (!user || !supabase) throw new Error('User not authenticated or Supabase client not initialized.');
    const normalizedName = fullName.trim();
    if (!normalizedName) throw new Error('Full name is required.');

    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: normalizedName })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to update user profile.', { error: error.message, userId: user.id });
      throw error;
    }
    setProfile(data);
  }, [supabase, user]);

  const updatePassword = useCallback(async (password: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase client not initialized.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, [supabase]);

  const updateUserSettings = useCallback(async (settings: Partial<UserSettings>): Promise<void> => {
    if (!user || !supabase) throw new Error('User not authenticated or Supabase client not initialized.');
    const nextSettings = { ...userSettings, ...settings };
    if (settings.font_size) {
      applyFontSize(settings.font_size);
    }
    // Optimistic update — revert on any failure below.
    setUserSettings(nextSettings);

    // Write to the dedicated user_settings table (primary store).
    const tableOk = await UserSettingsService.upsertSettings(supabase, user.id, nextSettings);
    if (!tableOk) {
      // Log but don't throw — fall through to user_metadata as a secondary write.
      logger.warn('user_settings upsert failed; falling back to user_metadata only.', { userId: user.id });
    }

    // Also keep user_metadata in sync as a secondary / cache layer.
    const { data, error } = await supabase.auth.updateUser({
      data: { settings: nextSettings },
    });
    if (error) {
      // Roll back optimistic update if both writes failed.
      if (!tableOk) {
        setUserSettings(userSettings);
        if (userSettings.font_size) applyFontSize(userSettings.font_size);
        throw error;
      }
      // Table write succeeded, so log the metadata failure but keep the new state.
      logger.warn('user_metadata settings sync failed (table write succeeded).', { userId: user.id, error: error.message });
      return;
    }
    if (data.user) setUser(data.user);
  }, [supabase, user, userSettings]);

  const updateUserLanguage = useCallback(async (newLanguageCode: string): Promise<void> => {
    if (!user || !supabase) throw new Error("User not authenticated or Supabase client not initialized.");

    const previousSettings = userSettings;
    const nextSettings: UserSettings = { ...userSettings, language: newLanguageCode };
    setUserSettings(nextSettings);

    const tableOk = await UserSettingsService.upsertSettings(supabase, user.id, nextSettings);
    if (!tableOk) {
      logger.warn('user_settings language update failed; attempting profile/user_metadata sync.', { userId: user.id });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ language: newLanguageCode })
      .eq('id', user.id);

    if (error) {
      logger.error('Failed to update user language in profile.', { error: error.message, userId: user.id });
      if (!tableOk) {
        setUserSettings(previousSettings);
        throw error;
      }
    } else {
      setProfile((prevProfile: UserProfile | null) => prevProfile ? { ...prevProfile, language: newLanguageCode } : null);
    }

    const { data, error: metadataError } = await supabase.auth.updateUser({
      data: { settings: nextSettings },
    });

    if (metadataError) {
      if (!tableOk && error) {
        setUserSettings(previousSettings);
        throw metadataError;
      }
      logger.warn('user_metadata language sync failed.', { userId: user.id, error: metadataError.message });
      return;
    }
    if (data.user) setUser(data.user);
  }, [supabase, user, userSettings]);

  const value = useMemo(() => ({
    session,
    user,
    profile,
    loading,
    initializationError,
    sessionReplacementPending,
    sessionReplacementError,
    retryInitialization,
    logoutReplacedSession,
    userSettings,
    login,
    signUp,
    logout,
    updateProfile,
    updatePassword,
    updateUserSettings,
    updateUserLanguage,
  }), [session, user, profile, loading, initializationError, sessionReplacementPending, sessionReplacementError, retryInitialization, logoutReplacedSession, userSettings, login, signUp, logout, updateProfile, updatePassword, updateUserSettings, updateUserLanguage]);

  useEffect(() => () => {
    if (replacementTimerRef.current !== null) window.clearTimeout(replacementTimerRef.current);
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
