// Declare the exact CDN import specifier used at runtime in the worker.
// This prevents TypeScript from complaining about the dynamic URL import.
declare module 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1' {
  export const env: any;
  export function pipeline(task: string, model: string, options?: any): Promise<any>;
  export type Pipeline = any;
}
