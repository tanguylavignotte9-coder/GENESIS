import { defineConfig } from 'vitest/config';

// Long tests (before finishing a step): 100-year balance, performance measurements.
export default defineConfig({
  test: {
    include: ['tests/long/**/*.test.ts'],
    environment: 'node',
    testTimeout: 900_000,
  },
});
