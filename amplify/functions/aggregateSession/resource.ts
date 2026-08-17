import { defineFunction } from '@aws-amplify/backend';

export const aggregateSessionFunction = defineFunction({
  name: 'aggregateSessionFunction',
  entry: './handler.ts',
  timeoutSeconds: 120,
  memoryMB: 512,
  runtime: 20,

  environment: {
    DEFAULT_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
    EMBEDDING_MODEL_ID: 'amazon.titan-embed-text-v2:0',
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
  }
});
