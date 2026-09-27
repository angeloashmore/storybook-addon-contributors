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

it("lists components that import this one", () => {
  const usedBy = data.components[storyImportPath("Card")].usedBy.map((user) => user.name).sort();
  expect(usedBy).toEqual(["CheckoutSummary", "ProductTile"]);
  expect(data.components[storyImportPath("Input")].usedBy).toEqual([]);
});

it("lists recent changes with pull request links", () => {
  const [latest] = data.components[storyImportPath("Card")].recentChanges;
  expect(latest.author).toBe("Ben Okafor");
  expect(latest.message).not.toMatch(/\(#\d+\)/);
  expect(latest.url).toBe(`https://github.com/acme/design-system/pull/${latest.pullRequest}`);
});

it("links to the component source", () => {
  expect(data.components[storyImportPath("Card")].sourceUrl).toBe(
    "https://github.com/acme/design-system/blob/HEAD/src/Card/Card.tsx",
  );
});

it("marks people who are no longer active in the repository", () => {
  const card = data.components[storyImportPath("Card")].contributors;
  expect(
    card.find((contributor) => contributor.name === "Alice Chen")?.inactiveSince,
  ).toBeDefined();
  expect(
    card.find((contributor) => contributor.name === "Ben Okafor")?.inactiveSince,
  ).toBeUndefined();
});

it("counts changes per month", () => {
  const { monthlyChanges } = data.components[storyImportPath("Card")];
  expect(monthlyChanges).toHaveLength(12);
  expect(monthlyChanges.slice(-3).reduce((total, count) => total + count, 0)).toBe(3);
});
