import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

let supabasePromise: Promise<SupabaseClient> | null = null;

/**
 * Fetches configuration from the backend and initializes the Supabase client.
 * Uses a Promise singleton pattern to prevent race conditions during initialization.
 * @returns {Promise<SupabaseClient>} A promise that resolves to the initialized Supabase client.
 */
export const getSupabaseClient = (): Promise<SupabaseClient> => {
  if (supabasePromise) {
    return supabasePromise;
  }

  supabasePromise = (async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      if (!apiUrl) {
        throw new Error('VITE_API_BASE_URL is not defined in .env file');
      }

      // Remove trailing slash if present
      const cleanUrl = apiUrl.replace(/\/$/, '');
      const response = await fetch(`${cleanUrl}/config`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }
      
      const config = await response.json();
      
      // Initialize the client once
      const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
      return client;
    } catch (error: unknown) {
      logger.error('Error initializing Supabase client:', undefined, { errorMessage: error instanceof Error ? error.message : String(error) });
      // Reset the promise so we can try again if it fails
      supabasePromise = null;
      throw new Error('Could not initialize Supabase client.');
    }
  })();

  return supabasePromise;
};
