/// <reference types="vite/client" />

/**
 * Global Ambient Type Declarations & Structural Asset Shims.
 * Calibrates the TypeScript compiler to natively recognize Vite worker threads,
 * WebAssembly binary buffers, and explicit runtime environment polyfills.
 */

declare module '*?worker' {
  /**
   * Ambient declaration shim mapping specialized background execution scripts.
   * Guarantees strict type safety when pulling custom threads into main UI loops.
   */
  const workerConstructor: {
    new (options?: WorkerOptions): Worker;
  };
  export default workerConstructor;
}

declare module '*.wasm' {
  /**
   * Ambient declaration shim mapping pre-compiled WebAssembly binary asset blocks.
   * Directs the compiler to treat target paths as stable strings for runtime fetches.
   */
  const contentPathString: string;
  export default contentPathString;
}

interface ProcessEnvContainer {
  readonly NODE_ENV?: 'development' | 'production' | 'test';
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_KEY?: string;
  readonly [key: string]: string | undefined;
}

// Extend the global globalThis namespace declaration to support polyfilled shims safely
declare global {
  /**
   * Structural polyfill mapping legacy environment variable hooks cleanly.
   * Prevents third-party neural runtimes from triggering fatal ReferenceErrors in standard client scopes.
   */
  const process: {
    readonly env: ProcessEnvContainer;
  };

  /**
   * Core execution scope anchor mapped directly to globalThis inside Vite configurations.
   */
  const global: typeof globalThis;
}

export {};