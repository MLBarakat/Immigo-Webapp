/**
 * Defines the shape of a user profile record from the 'profiles' Supabase table.
 * Decoupled from component files to allow clean cross-module imports.
 */
export interface UserProfile {
  id: string;
  full_name: string;
  language: string;
  created_at: string;
  updated_at: string;
}
