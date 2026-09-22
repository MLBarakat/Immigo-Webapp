import { useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import { Session, User, SupabaseClient, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabaseClient';
import { UserProfile } from '../types/profile';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../types/settings';
import { applyFontSize, getStoredFontSize } from '../utils/fontSize';
import { analytics } from '../analytics';
import { logger } from '../logger';
import { AuthContext, SignUpPayload } from './authContextTypes';

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => ({
    ...DEFAULT_USER_SETTINGS,
    font_size: getStoredFontSize(),
  }));
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const sessionLoadGenerationRef = useRef(0);

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
      const currentUser = currentSession?.user ?? null;

      setSession(currentSession);
      setUser(currentUser);
      setProfile(null);
      setUserSettings({
        ...DEFAULT_USER_SETTINGS,
        ...((currentUser?.user_metadata?.settings as Partial<UserSettings> | undefined) ?? {}),
      });
      setLoading(true);

      if (!currentUser) {
        if (!cancelled && generation === sessionLoadGenerationRef.current) {
          setLoading(false);
        }
        return;
      }

      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (cancelled || generation !== sessionLoadGenerationRef.current) return;

        if (profileError) {
          setProfile(null);
          logger.error('Error fetching user profile.', { error: profileError.message, userId: currentUser.id });
        } else {
          setProfile(profileData);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, newSession: Session | null) => {
      void loadSessionAndProfile(newSession);
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [supabase]);

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
    const { data, error } = await supabase.auth.updateUser({
      data: { settings: nextSettings },
    });
    if (error) throw error;
    setUserSettings(nextSettings);
    if (data.user) setUser(data.user);
  }, [supabase, user, userSettings]);

  const updateUserLanguage = useCallback(async (newLanguageCode: string): Promise<void> => {
    if (!user || !supabase) throw new Error("User not authenticated or Supabase client not initialized.");

    const { error } = await supabase
      .from('profiles')
      .update({ language: newLanguageCode })
      .eq('id', user.id);

    if (error) {
      logger.error('Failed to update user language in profile.', { error: error.message, userId: user.id });
      throw error;
    }
    setProfile((prevProfile: UserProfile | null) => prevProfile ? { ...prevProfile, language: newLanguageCode } : null);
  }, [user, supabase]);

  const value = useMemo(() => ({
    session,
    user,
    profile,
    loading,
    initializationError,
    retryInitialization,
    userSettings,
    login,
    signUp,
    logout,
    updateProfile,
    updatePassword,
    updateUserSettings,
    updateUserLanguage,
  }), [session, user, profile, loading, initializationError, retryInitialization, userSettings, login, signUp, logout, updateProfile, updatePassword, updateUserSettings, updateUserLanguage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}