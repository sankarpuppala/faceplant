import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base is '' so the build works from any subdirectory: GitHub Pages project
// pages, and itch.io's zip-relative hosting, both serve from a non-root path.
export default defineConfig({
  base: '',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        debug: resolve(import.meta.dirname, 'debug.html'),
      },
    },
  },
  server: { port: 5173, open: false },
  preview: { port: 4173 },
});
