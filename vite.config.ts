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
  server: {
    port: 5173,
    open: false,
    // `.uishots/` is `npm run check:ui`'s output directory, and that script
    // deletes and recreates it on every run while a dev server may be
    // watching the project tree. A headless Chrome screenshot landing in the
    // directory at the same instant Vite's watcher is mid-stat on it crashed
    // the whole dev server with an uncaught EBUSY - ignoring the directory is
    // the fix, since nothing in it is ever a source file Vite should serve.
    watch: { ignored: ['**/.uishots/**'] },
  },
  preview: { port: 4173 },
});
