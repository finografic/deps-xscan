import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiPort = process.env.DEMO_API_PORT ?? '4001';
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',

  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      components: resolve('src/components'),
      ui: resolve('src/components/ui'),
      pages: resolve('src/pages'),
      data: resolve('src/data'),
      lib: resolve('src/lib'),
      utils: resolve('src/lib/utils.ts'),
      shared: resolve('shared'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },

  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
