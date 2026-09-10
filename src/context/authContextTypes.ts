import { createContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { UserProfile } from '../types/profile';
import { UserSettings } from '../types/settings';

export interface SignUpPayload {
  email: string;
  password: string;
  fullName: string;
  language: string;
  /** Consent audit trail (recorded in Supabase user_metadata). */
  termsAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  initializationError: string | null;
  retryInitialization: () => void;
  userSettings: UserSettings;
  login: (email: string, password: string) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (fullName: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateUserSettings: (settings: Partial<UserSettings>) => Promise<void>;
  updateUserLanguage: (newLanguageCode: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);