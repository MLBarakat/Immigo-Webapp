import { defineFunction } from '@aws-amplify/backend';

export const myApiFunction = defineFunction ({
    entry: './handler.ts',
    memoryMB: 512,
    timeoutSeconds: 30,
    exportName: 'handler',
});
