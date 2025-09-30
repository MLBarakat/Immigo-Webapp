import { defineFunction } from '@aws-amplify/backend';

export const apiFunction = defineFunction({
name: 'api-function',
entry: './handler.ts',
memoryMB: 512,
timeoutSeconds: 30,
});
