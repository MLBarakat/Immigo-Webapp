import { createContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

interface SignUpPayload {
  email: string;
  password: string;
  fullName: string;
  language: string;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateUserLanguage: (newLanguageCode: string) => Promise<void>; // NEW
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        setSession(data.session);
        setUser(data.session?.user ?? null);
      } catch (err) {
        console.error("Error fetching session:", err);
      } finally {
        setLoading(false);
      }
    };
    getSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
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
    const { error } = await supabase.auth.updateUser({
      data: { language: newLanguageCode },
    });
    if (error) {
      console.error("Failed to update user language:", error.message);
      throw error;
    }
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if(refreshError) throw refreshError;
    if (data.user) setUser(data.user);
  };


  const value = useMemo(() => ({
      session,
      user,
      loading,
      login,
      signUp,
      logout,
      updateUserLanguage,
  }), [session, user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}