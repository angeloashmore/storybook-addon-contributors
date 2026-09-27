// E2E: build the example Storybook statically, open each scenario's story in
// Chromium, open the Contributors panel, and check the names and their order.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXAMPLE, FIXTURE, expected, generateFixture } from './helpers';

const OUT = join(EXAMPLE, 'storybook-static');
let server: Server;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  generateFixture();
  execFileSync('npx', ['storybook', 'build', '-o', OUT, '--quiet'], { cwd: EXAMPLE, stdio: 'inherit' });

  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  server = createServer((req, res) => {
    const path = join(OUT, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
    const file = statSync(path, { throwIfNoEntry: false })?.isDirectory() ? join(path, 'index.html') : path;
    try {
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
  // CHROMIUM_PATH lets you point at a preinstalled browser.
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});

afterAll(async () => {
  await browser?.close();
  server?.close();
});

describe('Contributors panel', () => {
  it.each(expected.scenarios)('$component ($scenario)', async ({ storyId, top, top3 }) => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/?path=/story/${storyId}`);
    await page.getByRole('tab', { name: 'Contributors' }).click();
    const nameLocator = page.getByTestId('contributor-name');
    await nameLocator.first().waitFor();
    const names = await nameLocator.allTextContents();
    await page.close();

    expect(top).toContain(names[0]);
    expect(names.slice(0, top.length).sort()).toEqual([...top].sort());
    for (const name of top3) expect(names.slice(0, 3)).toContain(name);
  });
});

describe('built output', () => {
  it('contains no author email addresses', () => {
    const emails = execFileSync('git', ['log', '--format=%ae'], { cwd: FIXTURE, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const unique = [...new Set(emails)];
    expect(unique.length).toBeGreaterThan(5);

    const files: string[] = [];
    const walk = (dir: string) =>
      readdirSync(dir).forEach((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : files.push(join(dir, f))));
    walk(OUT);

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const email of unique) expect(text.includes(email), `${email} in ${file}`).toBe(false);
    }
    // The embedded contributor data must not contain anything email-like at all.
    const html = readFileSync(join(OUT, 'index.html'), 'utf8');
    const data = html.match(/__COMPONENT_CONTRIBUTORS__ = (.*);<\/script>/)![1];
    expect(data).not.toContain('@');
  });
});
