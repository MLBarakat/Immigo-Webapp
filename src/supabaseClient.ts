import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

/**
 * Fetches configuration from the backend and initializes the Supabase client.
 * This function ensures that the client is a singleton.
 * @returns {Promise<SupabaseClient>} A promise that resolves to the initialized Supabase client.
 */
export const getSupabaseClient = async (): Promise<SupabaseClient> => {
  if (supabase) {
    return supabase;
  }

  try {
    // The API URL should be stored in a .env file as it depends on the deployment environment.
    const apiUrl = import.meta.env.VITE_API_BASE_URL;
    if (!apiUrl) {
      throw new Error('VITE_API_BASE_URL is not defined in .env file');
    }

    const response = await fetch(`${apiUrl}/config`);
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.statusText}`);
    }
    const config = await response.json();

    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    return supabase;
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
    throw new Error('Could not initialize Supabase client.');
  }
};
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);