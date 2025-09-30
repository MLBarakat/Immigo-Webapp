import { defineFunction } from '@aws-amplify/backend';

export const myApiFunction = defineFunction({
memoryMB: 512,
timeoutSeconds: 30,
});
