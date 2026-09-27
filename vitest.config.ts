import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/*.test.ts"],
    // Forks so tests can chdir: Storybook's story index uses process.cwd().
    pool: "forks",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 600_000,
  },
});
