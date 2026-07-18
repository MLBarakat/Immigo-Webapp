/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Authoritative Application Bundling Engine & Production Tuning Definition.
 * Hardened to handle multi-threaded WebAssembly matrices, background Workers, and split asset loads.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Establish strict absolute import pathways across project directories
      '@': resolve(__dirname, './src'),
    },
  },

  // FIXED: Prevents third-party ML runtimes from throwing fatal ReferenceErrors in the browser
  define: {
    'process.env': {},
    'global': 'globalThis',
  },

  // Developer runtime hosting engine settings
  server: {
    port: 3000,
    strictPort: true,
    headers: {
      // Inject necessary security parameters to safely unlock multithreaded SharedArrayBuffer pools
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Access-Control-Allow-Origin': '*',
    },
  },

  // Preview local compilation settings mapping staging gates
  preview: {
    port: 3000,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  worker: {
    // Orchestrate asynchronous transcription threads using pure ES modules natively
    format: 'es',
    plugins: () => [react()],
  },

  // FIXED: Isolates Vitest from Playwright E2E suites to prevent pipeline crashes
  test: {
    exclude: ['node_modules', 'dist', 'tests/e2e/**/*'],
  },

  build: {
    // Elevate the production baseline compilation rules to support modern JS runtimes
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // Turn off map tracking matrices to protect proprietary internal code trees
    chunkSizeWarningLimit: 1500, // Safe threshold window matching dynamic model bundle splitting rules

    rollupOptions: {
      output: {
        // Explicit structural chunk splitting matrix blocks monolithic assets
        manualChunks(id: string) {
          // Dynamic chunk loading isolation for external machine learning operations
          if (id.includes('node_modules/@xenova') || id.includes('node_modules/@onnxruntime')) {
            return 'neural-inference-runtime';
          }
          // Isolate extensive AWS cloud infrastructure automation packages
          if (id.includes('node_modules/@aws-sdk') || id.includes('aws-amplify')) {
            return 'cloud-infrastructure-sdk';
          }
          // Segment structural standard rendering tools from custom code bases
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-core-framework';
          }
          // Isolate peripheral graphical asset icons
          if (id.includes('node_modules/lucide-react')) {
            return 'viewport-graphic-assets';
          }
        },

        // Ensure asset distribution filenames utilize distinct version hashes to prevent caching issues
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const fileNameString = assetInfo.name || '';
          // Guarantee WebAssembly files retain pristine asset mapping markers during distribution
          if (fileNameString.endsWith('.wasm')) {
            return 'assets/wasm/[name]-[hash].[ext]'; // <-- Added Dot
          }
          if (fileNameString.endsWith('.css')) {
            return 'assets/css/[name]-[hash].[ext]'; // <-- Added Dot
          }
          return 'assets/[ext]/[name]-[hash].[ext]'; // <-- Added Dot
        },
      },
    },
  },

  optimizeDeps: {
    // Enforce early compilation extraction dependencies over complex underlying packages
    exclude: ['@onnxruntime/web'],
  },
});