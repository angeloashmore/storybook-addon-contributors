import { execFileSync } from "node:child_process";
import { buildIndex } from "storybook/internal/core-server";
import { beforeAll, expect, it } from "vitest";

import { collectContributors, type ContributorsData } from "../src/preset";
import { EXAMPLE_DIR, expectRanking, scenarios, storyImportPath } from "./shared";

let entries: Record<string, any>;
let data: ContributorsData;

beforeAll(async () => {
  execFileSync("node", [`${EXAMPLE_DIR}scripts/generate-fixture.mjs`]);
  process.chdir(EXAMPLE_DIR);
  const index = await buildIndex({ configDir: `${EXAMPLE_DIR}.storybook` } as any);
  entries = index.entries;
  data = collectContributors(entries);
});

function rankedNames(contributorsData: ContributorsData, component: string): string[] {
  return contributorsData.components[storyImportPath(component)].contributors.map(
    (contributor) => contributor.name,
  );
}

it.each(scenarios)("$component ($scenario)", (scenario) => {
  expectRanking(rankedNames(data, scenario.component), scenario);
});

it("uses the component file from the story index", () => {
  expect(data.components[storyImportPath("Button")].files).toEqual([
    "fixture/src/Button/Button.tsx",
  ]);
});

it("falls back to the story folder, excluding story files", () => {
  const entriesWithoutComponentPath = Object.fromEntries(
    Object.entries(entries).map(([id, entry]) => [id, { ...entry, componentPath: undefined }]),
  );
  const fallback = collectContributors(entriesWithoutComponentPath);

  expect(fallback.components[storyImportPath("Button")].files).toEqual(["fixture/src/Button"]);
  for (const scenario of scenarios)
    expectRanking(rankedNames(fallback, scenario.component), scenario);
  expect(JSON.stringify(fallback)).not.toContain("Quinn Harper");
});

it("skips bots, merge commits, and story-only edits", () => {
  const json = JSON.stringify(data);
  expect(json).not.toContain("[bot]");
  expect(json).not.toContain("Ivan Petrov");
  expect(json).not.toContain("Quinn Harper");
});

it("never includes email addresses", () => {
  expect(JSON.stringify(data)).not.toContain("@");
});
