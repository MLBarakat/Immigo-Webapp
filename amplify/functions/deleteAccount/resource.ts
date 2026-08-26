import { defineFunction, secret } from '@aws-amplify/backend';

export const deleteAccountFunction = defineFunction({
  name: 'deleteAccountFunction',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 256,
  runtime: 20,

  environment: {
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: secret('SUPABASE_SERVICE_ROLE_KEY') || '',
  },
});
