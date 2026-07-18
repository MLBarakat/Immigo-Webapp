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

  // Prevents third-party ML runtimes from throwing fatal ReferenceErrors in the browser
  define: {
    'process.env': {},
    'global': 'globalThis',
  },

  server: {
    port: 3000,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Access-Control-Allow-Origin': '*',
    },
  },

  preview: {
    port: 3000,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  worker: {
    format: 'es',
    plugins: () => [react()],
  },

  // Isolates Vitest from Playwright E2E suites to prevent pipeline crashes
  test: {
    exclude: ['node_modules', 'dist', 'tests/e2e/**/*'],
  },

  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,

    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/@xenova') || id.includes('node_modules/@onnxruntime')) {
            return 'neural-inference-runtime';
          }
          if (id.includes('node_modules/@aws-sdk') || id.includes('aws-amplify')) {
            return 'cloud-infrastructure-sdk';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-core-framework';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'viewport-graphic-assets';
          }
        },

        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const fileNameString = assetInfo.name || '';
          // Hardcoded dot separator to fix Rollup missing extension bug
          if (fileNameString.endsWith('.wasm')) {
            return 'assets/wasm/[name]-[hash].[ext]';
          }
          if (fileNameString.endsWith('.css')) {
            return 'assets/css/[name]-[hash].[ext]';
          }
          return 'assets/[ext]/[name]-[hash].[ext]';
        },
      },
    },
  },

  optimizeDeps: {
    exclude: ['@onnxruntime/web'],
  },
});