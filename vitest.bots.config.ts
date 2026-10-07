import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/bots/**/*.bots.ts'],
    environment: 'node',
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
    reporters: ['verbose'],
  },
});
