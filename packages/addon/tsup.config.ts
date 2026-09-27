import { defineConfig, type Options } from 'tsup';

// Mirrors the Storybook addon-kit setup: manager code targets the browser,
// the preset and the collector target Node.
const common: Options = {
  clean: false,
  format: ['esm'],
  treeshake: true,
  splitting: true,
  external: [/^react/, /^storybook/, '@storybook/icons'],
};

export default defineConfig([
  { ...common, entry: ['src/manager.tsx'], platform: 'browser', target: 'esnext' },
  { ...common, entry: ['src/preset.ts', 'src/index.ts'], platform: 'node', target: 'node20.19', dts: { entry: 'src/index.ts' } },
]);
