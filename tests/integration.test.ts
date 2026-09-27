// Integration: generate the fixture repo, run the addon's data collection on
// Storybook's real story index, and compare with example/expected.json.

import { join } from 'node:path';
import { buildIndex } from 'storybook/internal/core-server';
import { collectContributors, type ContributorsData, type IndexEntryLike } from 'storybook-addon-component-contributors';
import { beforeAll, describe, expect, it } from 'vitest';

import { EXAMPLE, expected, generateFixture, storyImportPath } from './helpers';

let entries: Record<string, IndexEntryLike>;
let data: ContributorsData;

beforeAll(async () => {
  generateFixture();
  process.chdir(EXAMPLE);
  const index = await buildIndex({ configDir: join(EXAMPLE, '.storybook') } as any);
  entries = index.entries as Record<string, IndexEntryLike>;
  data = collectContributors(entries, { cwd: EXAMPLE });
});

const names = (d: ContributorsData, component: string) =>
  d.components[storyImportPath(component)].contributors.map((c) => c.name);

describe('contributors per scenario', () => {
  it.each(expected.scenarios)('$component ($scenario)', ({ component, top, top3 }) => {
    const ranked = names(data, component);
    expect(top).toContain(ranked[0]);
    // With several acceptable leaders, all of them belong right at the top.
    expect(ranked.slice(0, top.length).sort()).toEqual([...top].sort());
    for (const name of top3) expect(ranked.slice(0, 3)).toContain(name);
  });

  it('uses componentPath from the story index', () => {
    const entry = Object.values(entries).find((e) => e.importPath === storyImportPath('Button'));
    expect(entry?.componentPath).toMatch(/Button\/Button\.tsx$/);
    expect(data.components[storyImportPath('Button')].files).toEqual(['fixture/src/Button/Button.tsx']);
  });

  it('falls back to the story folder when componentPath is missing', () => {
    const withoutComponentPath = Object.values(entries).map(({ componentPath, ...rest }) => rest);
    const fallback = collectContributors(withoutComponentPath, { cwd: EXAMPLE });
    expect(fallback.components[storyImportPath('Button')].files).toEqual(['fixture/src/Button']);
    for (const { component, top } of expected.scenarios) expect(top).toContain(names(fallback, component)[0]);
  });

  it('skips bots and merge commits', () => {
    const all = Object.values(data.components).flatMap((c) => c.contributors.map((p) => p.name));
    expect(all.filter((n) => n.includes('[bot]'))).toEqual([]);
    // Ivan only authored merge commits (and the initial repo setup, outside any component).
    expect(all).not.toContain('Ivan Petrov');
  });

  it('never includes email addresses', () => {
    expect(JSON.stringify(data)).not.toMatch(/@/);
  });

  it('respects the half-life option', () => {
    // With a very long half-life, raw commit counts dominate and Alice wins Card.
    const flat = collectContributors(entries, { cwd: EXAMPLE, halfLifeDays: 100_000 });
    expect(names(flat, 'Card')[0]).toBe('Alice Chen');
  });
});
