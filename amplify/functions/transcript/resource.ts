import { defineFunction } from '@aws-amplify/backend';

export const transcriptFunction = defineFunction({
  name: 'transcriptFunction',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  runtime: 20,
  
  // NATIVE FIX: Variables defined here are injected automatically at build time
  environment: {
    DEFAULT_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0'
  }
});