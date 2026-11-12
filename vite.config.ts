import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Many tests run hundreds of races. The 5 second default is too close on a busy machine.
    testTimeout: 30000,
  },
});
