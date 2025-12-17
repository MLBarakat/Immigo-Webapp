import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';



// https://vitejs.dev/config/

export default defineConfig({

  plugins: [

    react(),

    viteStaticCopy({

      targets: [

        {

          src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',

          dest: './',

        },

        {

          src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',

          dest: './',

        },

        {

          src: 'node_modules/onnxruntime-web/dist/*.wasm',

          dest: './',

        },

        {

          src: 'node_modules/onnxruntime-web/dist/*.mjs',

          dest: './',

        },

        {

          src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',

          dest: './assets/',

        },

        {

          src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',

          dest: './assets/',

        },

        {

          src: 'node_modules/onnxruntime-web/dist/*.wasm',

          dest: './assets/',

        },

        {

          src: 'node_modules/onnxruntime-web/dist/*.mjs',

          dest: './assets/',

        },

        // Also copy to the project's public directory so hosting (Amplify) serves them

        {

          src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',

          dest: 'public/assets/',

        },

        {

          src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',

          dest: 'public/',

        },

        {

          src: 'node_modules/onnxruntime-web/dist/*.wasm',

          dest: 'public/assets/',

        },

        {

          src: 'node_modules/onnxruntime-web/dist/*.mjs',

          dest: 'public/assets/',

        },

      ],

    }),

  ],

      worker: {

        format: 'es',

      },
      build: {
        rollupOptions: {
          external: ['@xenova/transformers'],
        },
      }
    });

  
