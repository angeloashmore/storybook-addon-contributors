import { readFileSync } from "node:fs";
import { expect } from "vitest";

export const EXAMPLE_DIR = new URL("../example/", import.meta.url).pathname;

export type Scenario = {
  component: string;
  storyId: string;
  scenario: string;
  top: string[];
  top3: string[];
};

export const scenarios: Scenario[] = JSON.parse(
  readFileSync(`${EXAMPLE_DIR}expected.json`, "utf8"),
).scenarios;

export function storyImportPath(component: string): string {
  return `./fixture/src/${component}/${component}.stories.tsx`;
}

export function expectRanking(names: string[], { top, top3 }: Scenario) {
  expect(names.slice(0, top.length).sort()).toEqual([...top].sort());
  for (const name of top3) expect(names.slice(0, 3)).toContain(name);
}
