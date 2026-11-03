import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';
import type { Database } from '../supabase/database-export/database.types';

let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Returns the singleton Supabase client.
 *
 * Required Amplify Environment Variables:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 */
export const getSupabaseClient = (): SupabaseClient<Database> => {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Helpful debug information (safe to keep in development)
  console.group('========== SUPABASE CONFIG ==========');
  console.log('VITE_SUPABASE_URL:', supabaseUrl);
  console.log(
    'VITE_SUPABASE_ANON_KEY:',
    supabaseAnonKey ? '[PRESENT]' : '[MISSING]'
  );
  console.groupEnd();

  if (!supabaseUrl) {
    throw new Error(
      'Missing environment variable: VITE_SUPABASE_URL'
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      'Missing environment variable: VITE_SUPABASE_ANON_KEY'
    );
  }

  try {
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

    logger.info('Supabase client initialized successfully.');

    return supabaseClient;
  } catch (error) {
    logger.error('Failed to initialize Supabase client.', undefined, {
      error:
        error instanceof Error
          ? error.stack
          : JSON.stringify(error),
    });

    console.error(error);

    throw error;
  }
};