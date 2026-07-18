import { createClient, SupabaseClient } from '@supabase/supabase-js';
import amplifyOutputs from '../amplify_outputs.json';
import { logger } from './logger';

interface AmplifyOutputShape {
  custom?: {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
  };
}

let supabasePromise: Promise<SupabaseClient> | null = null;

const resolveSupabaseConfig = (): { supabaseUrl: string; supabaseAnonKey: string } => {
  const manifest = amplifyOutputs as AmplifyOutputShape;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || manifest.custom?.SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || manifest.custom?.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase runtime configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or provide them in amplify_outputs.json.'
    );
  }

  return { supabaseUrl, supabaseAnonKey };
};

/**
 * Initializes the Supabase client from the authoritative runtime config manifest
 * without performing an obsolete fetch to a legacy backend /config endpoint.
 * Uses a Promise singleton pattern to prevent race conditions during initialization.
 * @returns {Promise<SupabaseClient>} A promise that resolves to the initialized Supabase client.
 */
export const getSupabaseClient = (): Promise<SupabaseClient> => {
  if (supabasePromise) {
    return supabasePromise;
  }

  supabasePromise = (async () => {
    try {
      const { supabaseUrl, supabaseAnonKey } = resolveSupabaseConfig();
      const client = createClient(supabaseUrl, supabaseAnonKey);
      return client;
    } catch (error: unknown) {
      logger.error('Error initializing Supabase client:', undefined, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      supabasePromise = null;
      throw new Error('Could not initialize Supabase client.');
    }
  })();

  return supabasePromise;
};
