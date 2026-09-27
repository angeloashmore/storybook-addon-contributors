import { readFileSync } from 'node:fs';
import { expect } from 'vitest';

export const EXAMPLE = new URL('../example/', import.meta.url).pathname;

export const scenarios: { component: string; storyId: string; scenario: string; top: string[]; top3: string[] }[] =
  JSON.parse(readFileSync(`${EXAMPLE}expected.json`, 'utf8')).scenarios;

/** Leaders (any order) come first, and every top3 name is in the top three. */
export function expectRanking(names: string[], { top, top3 }: { top: string[]; top3: string[] }) {
  expect(names.slice(0, top.length).sort()).toEqual([...top].sort());
  for (const name of top3) expect(names.slice(0, 3)).toContain(name);
}
