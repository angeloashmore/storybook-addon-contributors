import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

import { EXAMPLE_DIR, expectRanking, scenarios } from "./shared";

const STATIC_DIR = `${EXAMPLE_DIR}storybook-static`;
const PORT = 6199;
const CONTENT_TYPES: Record<string, string> = { ".js": "text/javascript", ".html": "text/html" };

const server = createServer((request, response) => {
  const pathname = new URL(request.url!, "http://localhost").pathname.replace(/\/$/, "/index.html");
  const file = join(STATIC_DIR, pathname);
  try {
    response.setHeader("content-type", CONTENT_TYPES[extname(file)] ?? "");
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404).end();
  }
});

let browser: Browser;

beforeAll(async () => {
  execFileSync("npm", ["run", "build-storybook"], { cwd: `${EXAMPLE_DIR}..`, stdio: "ignore" });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});

afterAll(async () => {
  await browser?.close();
  server.close();
});

it.each(scenarios)("panel for $component ($scenario)", async (scenario) => {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/?path=/story/${scenario.storyId}`);
  await page.getByRole("tab", { name: "Contributors" }).click();

  const names = page.getByTestId("contributor-name");
  await names.first().waitFor();
  expectRanking(await names.allTextContents(), scenario);

  await page.close();
});

it("shows recent changes and inactive people", async () => {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/?path=/story/scenarios-card--default`);
  await page.getByRole("tab", { name: "Contributors" }).click();

  expect(await page.getByTestId("recent-change").first().textContent()).toContain("Ben Okafor");
  expect(await page.getByTestId("inactive").textContent()).toContain(
    "Not active in this repo since",
  );

  await page.close();
});

it("marks components changed in the last week in the sidebar", async () => {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/?path=/story/scenarios-card--default`);
  const dot = page.getByTestId("changed-dot").first();
  await dot.waitFor();

  const box = (await dot.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  const tooltip = page.getByRole("tooltip");
  await tooltip.waitFor();
  expect(await tooltip.textContent()).toBe("Changed 4 days ago");

  await page.close();
});

it("shows the people on the docs page and links to the panel", async () => {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/?path=/docs/scenarios-card--docs`);
  const block = page
    .frameLocator("#storybook-preview-iframe")
    .getByTestId("contributors-docs-block");
  expect(await block.textContent()).toMatch(/Ben Okafor, .+ have worked on this/);

  await block.getByRole("button", { name: /See people and recent changes/ }).click();
  await page.waitForURL(/scenarios-card--default/);
  expect(await page.getByTestId("contributor-name").first().textContent()).toBe("Ben Okafor");

  await page.close();
});

it("built output contains no author emails", () => {
  const log = execFileSync("git", ["log", "--format=%ae"], {
    cwd: `${EXAMPLE_DIR}fixture`,
    encoding: "utf8",
  });
  const emails = new Set(log.split("\n").filter(Boolean));
  expect(emails.size).toBeGreaterThan(5);

  const files = readdirSync(STATIC_DIR, { recursive: true, withFileTypes: true }).filter((entry) =>
    entry.isFile(),
  );
  for (const file of files) {
    const text = readFileSync(join(file.parentPath, file.name), "utf8");
    for (const email of emails)
      expect(text.includes(email), `${email} in ${file.name}`).toBe(false);
  }
});
