import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Builds the display (renderer) and the simulation worker into dist/renderer.
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  worker: {
    format: 'es',
  },
});
