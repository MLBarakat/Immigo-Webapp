import { createClient, SupabaseClient } from '@supabase/supabase-js';
import amplifyOutputs from '../amplify_outputs.json';
import { logger } from './logger';

interface AmplifyOutputShape {
  custom?: {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    API_URL?: string;
  };
}

let supabasePromise: Promise<SupabaseClient> | null = null;

const resolveSupabaseConfig = (): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} => {
  const manifest = amplifyOutputs as AmplifyOutputShape;

  console.group('========== SUPABASE CONFIG DEBUG ==========');

  console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
  console.log(
    'VITE_SUPABASE_ANON_KEY:',
    import.meta.env.VITE_SUPABASE_ANON_KEY
      ? '[PRESENT]'
      : '[MISSING]'
  );

  console.log('Amplify Outputs:', manifest);

  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ??
    manifest.custom?.SUPABASE_URL ??
    '';

  const supabaseAnonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    manifest.custom?.SUPABASE_ANON_KEY ??
    '';

  console.log('Resolved URL:', supabaseUrl);
  console.log(
    'Resolved Key:',
    supabaseAnonKey ? '[PRESENT]' : '[MISSING]'
  );

  console.groupEnd();

  if (!supabaseUrl) {
    throw new Error(
      'Supabase URL is missing.\n\n' +
      'Checked:\n' +
      '1. import.meta.env.VITE_SUPABASE_URL\n' +
      '2. amplify_outputs.json -> custom.SUPABASE_URL'
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      'Supabase Anon Key is missing.\n\n' +
      'Checked:\n' +
      '1. import.meta.env.VITE_SUPABASE_ANON_KEY\n' +
      '2. amplify_outputs.json -> custom.SUPABASE_ANON_KEY'
    );
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
};

export const getSupabaseClient = (): Promise<SupabaseClient> => {
  if (supabasePromise) {
    return supabasePromise;
  }

  supabasePromise = (async () => {
    try {
      const { supabaseUrl, supabaseAnonKey } = resolveSupabaseConfig();

      console.log('Creating Supabase client...');

      const client = createClient(supabaseUrl, supabaseAnonKey);

      console.log('Supabase client initialized successfully.');

      return client;
    } catch (error) {
      console.error('SUPABASE INITIALIZATION FAILED');
      console.error(error);

      logger.error('Supabase initialization failure', undefined, {
        error:
          error instanceof Error ? error.stack : String(error),
      });

      supabasePromise = null;

      throw error;
    }
  })();

  return supabasePromise;
};