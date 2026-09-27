import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

import { EXAMPLE_DIR, expectRanking, scenarios } from "./shared";

const STATIC_DIR = `${EXAMPLE_DIR}storybook-static`;
const PORT = 6199;

const server = createServer((request, response) => {
  const pathname = new URL(request.url!, "http://localhost").pathname.replace(/\/$/, "/index.html");
  const file = join(STATIC_DIR, pathname);
  try {
    const contentType = file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".html")
        ? "text/html"
        : "";
    response.setHeader("content-type", contentType);
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
