import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Forks so tests can chdir (Storybook's index uses process.cwd()).
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 600_000,
  },
});
