import { defineConfig } from 'vitest/config';

// Fast tests (run at every commit): everything except tests/long.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/long/**', 'node_modules/**'],
    environment: 'node',
    // Generous: the machine may be busy with other simulations.
    testTimeout: 30_000,
  },
});
