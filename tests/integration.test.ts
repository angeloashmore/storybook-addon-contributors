// Generate the fixture, run the addon's collector on Storybook's real story
// index, and compare with example/expected.json.

import { execFileSync } from 'node:child_process';
import { buildIndex } from 'storybook/internal/core-server';
import { beforeAll, expect, it } from 'vitest';

import { collectContributors, type ContributorsData } from '../packages/addon/preset';
import { EXAMPLE, expectRanking, scenarios } from './shared';

let entries: Record<string, any>;
let data: ContributorsData;

beforeAll(async () => {
  execFileSync('node', [`${EXAMPLE}scripts/generate-fixture.mjs`]);
  process.chdir(EXAMPLE);
  entries = (await buildIndex({ configDir: `${EXAMPLE}.storybook` } as any)).entries;
  data = collectContributors(entries);
});

const ranked = (d: ContributorsData, c: string) => d.components[`./fixture/src/${c}/${c}.stories.tsx`].contributors.map((p) => p.name);

it.each(scenarios)('$component ($scenario)', (s) => expectRanking(ranked(data, s.component), s));

it('uses componentPath, or the story folder without it', () => {
  expect(data.components['./fixture/src/Button/Button.stories.tsx'].files).toEqual(['fixture/src/Button/Button.tsx']);
  const fallback = collectContributors(Object.fromEntries(Object.entries(entries).map(([k, { componentPath, ...e }]) => [k, e])));
  expect(fallback.components['./fixture/src/Button/Button.stories.tsx'].files).toEqual(['fixture/src/Button']);
  for (const s of scenarios) expect(s.top).toContain(ranked(fallback, s.component)[0]);
});

it('skips bots and merge commits, and never includes emails', () => {
  const json = JSON.stringify(data);
  expect(json).not.toMatch(/\[bot\]|Ivan Petrov|@/);
});

it('respects the half-life option', () => {
  // With a huge half-life, raw commit counts dominate and Alice wins Card.
  expect(ranked(collectContributors(entries, { halfLifeDays: 1e6 }), 'Card')[0]).toBe('Alice Chen');
});
