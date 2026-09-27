import { defineConfig } from 'vitest/config';

// Forks so tests can chdir (Storybook's story index uses process.cwd()).
export default defineConfig({ test: { include: ['tests/*.test.ts'], pool: 'forks', fileParallelism: false, testTimeout: 60_000, hookTimeout: 600_000 } });
