// Minimal ambient declarations for the '@xenova/transformers' package
// This file prevents TypeScript build errors in CI when the package doesn't ship types.
declare module '@xenova/transformers' {
  export const env: any;
  export function pipeline(task: string, model: string, options?: any): Promise<any>;
  export type Pipeline = any;
  export default any;
}
