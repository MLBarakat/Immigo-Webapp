import { defineFunction } from '@aws-amplify/backend';

export const apiFunction = defineFunction({
  name: 'immigo-function',
  entry: '../functions/handler.ts',
  memoryMB: 1024, // Increased for better performance with audio processing
  timeoutSeconds: 30,
  environment: {
    NODE_ENV: 'production'
  }
});
