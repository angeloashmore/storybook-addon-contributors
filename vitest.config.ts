import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Bare `vitest` runs only the tests project; evals need `--project evals`.
    // @ts-expect-error -- Vitest honors `project` in config but only types it as a CLI flag.
    project: "tests",
    projects: [
      {
        test: {
          name: "tests",
          include: ["tests/*.test.ts"],
          pool: "forks",
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 600_000,
        },
      },
      {
        test: {
          name: "evals",
          include: ["evals/*.eval.ts"],
          pool: "forks",
          maxConcurrency: 8,
          testTimeout: 600_000,
        },
      },
    ],
  },
});
