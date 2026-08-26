import { defineFunction } from '@aws-amplify/backend';

export const deleteAccountFunction = defineFunction({
  name: 'deleteAccountFunction',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 256,
  runtime: 20,

  environment: {
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    // Service-role key is REQUIRED to delete an auth user. Server-side only.
    // Set SUPABASE_SERVICE_ROLE_KEY in your deploy environment; never ship it to the client.
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
});
