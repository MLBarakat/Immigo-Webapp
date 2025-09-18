import { createContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types/user';

interface SignUpPayload {
  email: string;
  password: string;
  fullName: string;
  language: string;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateUserLanguage: (newLanguageCode: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSessionAndProfile = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        setSession(session);
        const currentUser = session?.user;
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
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
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async ({ email, password, fullName, language }: SignUpPayload): Promise<void> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, language } },
    });
    if (error) throw error;
  };

  const logout = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const updateUserLanguage = async (newLanguageCode: string): Promise<void> => {
    if (!user) throw new Error("User not authenticated.");

    const { error } = await supabase
      .from('profiles')
      .update({ language: newLanguageCode })
      .eq('id', user.id);

    if (error) {
      console.error("Failed to update user language in profile:", error.message);
      throw error;
    }
    setProfile(prevProfile => prevProfile ? { ...prevProfile, language: newLanguageCode } : null);
  };

  const value = useMemo(() => ({
      session,
      user,
      profile,
      loading,
      login,
      signUp,
      logout,
      updateUserLanguage,
  }), [session, user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}