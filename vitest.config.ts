import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bare `vitest` runs only tests; evals need `--project evals`. Vitest honors
    // `project` in config but only types it as a CLI flag.
    // @ts-expect-error -- untyped passthrough of the --project flag
    project: 'tests',
    projects: [
      // Forks so files can chdir: Storybook's story index uses process.cwd().
      { test: { name: 'tests', include: ['tests/*.test.ts'], pool: 'forks', fileParallelism: false, testTimeout: 60_000, hookTimeout: 600_000 } },
      { test: { name: 'evals', include: ['evals/*.eval.ts'], pool: 'forks', maxConcurrency: 8, testTimeout: 600_000 } },
    ],
  },
});
