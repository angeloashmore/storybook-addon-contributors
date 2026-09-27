// Build the example Storybook statically, open each scenario in Chromium, open
// the Contributors panel, and check the names and their order.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { EXAMPLE, expectRanking, scenarios } from './shared';

const OUT = `${EXAMPLE}storybook-static`;
const server = createServer((req, res) => {
  const path = join(OUT, new URL(req.url!, 'http://x').pathname.replace(/\/$/, '/index.html'));
  try {
    res.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.html') ? 'text/html' : '');
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
let browser: Browser;

beforeAll(async () => {
  execFileSync('npm', ['run', 'build'], { cwd: `${EXAMPLE}..`, stdio: 'ignore' }); // also regenerates the fixture
  await new Promise<void>((r) => server.listen(6199, r));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); // optional preinstalled Chromium
});

afterAll(async () => {
  await browser?.close();
  server.close();
});

it.each(scenarios)('panel for $component ($scenario)', async (s) => {
  const page = await browser.newPage();
  await page.goto(`http://localhost:6199/?path=/story/${s.storyId}`);
  await page.getByRole('tab', { name: 'Contributors' }).click();
  await page.getByTestId('contributor-name').first().waitFor();
  expectRanking(await page.getByTestId('contributor-name').allTextContents(), s);
  await page.close();
});

it('built output contains no author emails', () => {
  const emails = new Set(execFileSync('git', ['log', '--format=%ae'], { cwd: `${EXAMPLE}fixture`, encoding: 'utf8' }).split('\n').filter(Boolean));
  expect(emails.size).toBeGreaterThan(5);
  for (const file of readdirSync(OUT, { recursive: true, withFileTypes: true }).filter((f) => f.isFile())) {
    const text = readFileSync(join(file.parentPath, file.name), 'utf8');
    for (const email of emails) expect(text.includes(email), `${email} in ${file.name}`).toBe(false);
  }
});
