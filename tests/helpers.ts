import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const EXAMPLE = join(ROOT, 'example');
export const FIXTURE = join(EXAMPLE, 'fixture');

export interface Scenario {
  component: string;
  storyId: string;
  scenario: string;
  intent: string;
  top: string[];
  top3: string[];
}

export const expected: { scenarios: Scenario[] } = JSON.parse(readFileSync(join(EXAMPLE, 'expected.json'), 'utf8'));

export function generateFixture() {
  execFileSync('node', [join(EXAMPLE, 'scripts/generate-fixture.mjs')], { stdio: 'inherit' });
}

export const storyImportPath = (component: string) => `./fixture/src/${component}/${component}.stories.tsx`;
