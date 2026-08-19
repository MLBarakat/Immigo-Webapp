import { defineFunction } from '@aws-amplify/backend';

export const transcriptFunction = defineFunction({
  name: 'transcriptFunction',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  runtime: 20,

  environment: {
    DEFAULT_MODEL_ID: 'anthropic.claude-haiku-4-5-20251001-v1:0',
    EMBEDDING_MODEL_ID: 'amazon.titan-embed-text-v2:0',
    SLIDING_WINDOW_TURNS: '6',
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  }
});
