import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins: PluginOption[] = [react()];

  if (mode !== 'test') {
    const { viteStaticCopy } = await import('vite-plugin-static-copy');
    plugins.push(
      viteStaticCopy({
        targets: [
          // VAD worklet and ONNX model for @ricky0123/vad-web
          { src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: './' },
          { src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', dest: './' },
          { src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: './assets/' },
          { src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', dest: './assets/' },
          { src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: 'public/assets/' },
          { src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', dest: 'public/' },

          // ONNX Runtime Web WASM and MJS binaries — required for onnxruntime-web v1.19.2
          { src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: './' },
          { src: 'node_modules/onnxruntime-web/dist/*.mjs', dest: './' },
          { src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: './assets/' },
          { src: 'node_modules/onnxruntime-web/dist/*.mjs', dest: './assets/' },
          { src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: 'public/assets/' },
          { src: 'node_modules/onnxruntime-web/dist/*.mjs', dest: 'public/assets/' },
        ],
      }),
    );
  }

  return {
    plugins,

    // Worker bundle format — ES modules required for dynamic imports inside Web Workers
    worker: {
      format: 'es',
    },

    build: {
      target: 'esnext',
      sourcemap: false,
    },

    // Exclude ONNX WASM/MJS assets from Vite's dependency pre-bundling
    // These are binary assets that must be served as-is, not transformed by esbuild
    optimizeDeps: {
      exclude: ['onnxruntime-web', '@huggingface/transformers'],
    },

    // Dev server headers required for SharedArrayBuffer + WebGPU threading
    // COOP and COEP isolate the browsing context so cross-origin isolation is enabled
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },

    // Preview server headers mirror dev server for production build testing
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },

    // Vitest configuration block
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
      },
    },
  };
});
