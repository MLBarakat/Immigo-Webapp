import { createContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { UserProfile } from '../types/profile';

export interface SignUpPayload {
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