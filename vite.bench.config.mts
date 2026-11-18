import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Builds the benchmark into one Node.js file (dist/bench/benchmark.mjs): it runs the compiled
// simulation code, with Node.js or with Electron's own Node.js (no tsx needed).
export default defineConfig({
  build: {
    ssr: resolve(import.meta.dirname, 'src/cli/benchmark.ts'),
    outDir: resolve(import.meta.dirname, 'dist/bench'),
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { entryFileNames: 'benchmark.mjs', format: 'es' } },
  },
});
