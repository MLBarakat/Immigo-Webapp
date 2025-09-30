import { defineFunction } from '@aws-amplify/backend';

export const myApiFunction = defineFunction ({
    // The file that contains your server logic
    entry: './handler.ts',
    // Increase memory and timeout for AI workloads
    memoryMB: 512,
    timeoutSeconds: 30,
});