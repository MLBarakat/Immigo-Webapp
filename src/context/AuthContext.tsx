import { useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { Session, User, SupabaseClient, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabaseClient';
import { UserProfile } from '../components/UserProfile';
import { analytics } from '../analytics'; // Import analytics service
import { AuthContext, SignUpPayload } from './authContextTypes';

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeSupabase = async () => {
      const client = await getSupabaseClient();
      setSupabase(client);
    };
    initializeSupabase();
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const getSessionAndProfile = async () => {
        try {
            const { data: { session: currentSession }, error } = await supabase.auth.getSession();
            if (error) throw error;
            setSession(currentSession);
            const currentUser = currentSession?.user;
            setUser(currentUser ?? null);

            if (currentUser) {
              const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single();

              if (profileError) {
                console.error("Error fetching user profile:", profileError.message);
              } else {
                setProfile(profileData);
              }
            }
        } catch (err) {
            console.error("Error in session/profile fetch:", err);
        } finally {
            setLoading(false);
        }
    };
    getSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, newSession: Session | null) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (!newSession?.user) {
            setProfile(null);
        } else {
            getSessionAndProfile();
        }
    });

    return () => {
        subscription?.unsubscribe();
    };
  }, [supabase]);

  const login = async (email: string, password: string): Promise<void> => {
    if (!supabase) throw new Error("Supabase client not initialized.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    analytics.track('user_login', { method: 'email' }); // Event tracking
  };

  const signUp = async ({ email, password, fullName, language }: SignUpPayload): Promise<void> => {
    if (!supabase) throw new Error("Supabase client not initialized.");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, language } },
    });
    if (error) throw error;
    analytics.track('user_signup', { method: 'email', language }); // Event tracking
  };

  const logout = async (): Promise<void> => {
    if (!supabase) throw new Error("Supabase client not initialized.");
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    analytics.track('user_logout'); // Event tracking
  };

  const updateUserLanguage = useCallback(async (newLanguageCode: string): Promise<void> => {
      if (!user || !supabase) throw new Error("User not authenticated or Supabase client not initialized.");

      const { error } = await supabase
        .from('profiles')
        .update({ language: newLanguageCode })
        .eq('id', user.id);

      if (error) {
        console.error("Failed to update user language in profile:", error.message);
        throw error;
      }
      setProfile((prevProfile: UserProfile | null) => prevProfile ? { ...prevProfile, language: newLanguageCode } : null);
  }, [user, supabase]);

  const value = useMemo(() => ({
      session,
      user,
      profile,
      loading,
      login,
      signUp,
      logout,
      updateUserLanguage,
  }), [session, user, profile, loading, updateUserLanguage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
