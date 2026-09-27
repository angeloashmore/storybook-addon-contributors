#!/usr/bin/env node
// Generates example/fixture: a separate git repo with scripted history. Commits
// get fake authors and dates relative to now, so recency results stay stable.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const days = (...ds) => ds;

// [daysAgo, author, target]. The first commit to a component creates it; later
// ones edit it. "Tabs via merge" lands on a branch that Ivan merges (--no-ff).
// "*" is the big formatting commit that touches every file.
const history = [
  [800, 'Ivan Petrov', 'README.md'],
  // 1. Clear owner: Priya made most commits, recently.
  ...days(260, 200).map((d) => [d, 'Marcus Lee', 'Button']),
  ...days(120, 90, 70, 50, 35, 21, 8).map((d) => [d, 'Priya Patel', 'Button']),
  // 2. Faded original author: Alice ~2 years ago, Ben fewer but recent.
  ...days(760, 750, 745, 738, 730, 722, 715, 708, 700, 695, 690, 685).map((d) => [d, 'Alice Chen', 'Card']),
  ...days(90, 45, 15).map((d) => [d, 'Ben Okafor', 'Card']),
  // 3. Shared: Elena and Farid, similar and recent.
  ...days(520, 500).map((d) => [d, 'George Novak', 'Input']),
  ...days(110, 75, 40, 12).map((d) => [d, 'Elena Rossi', 'Input']),
  ...days(105, 80, 35, 18).map((d) => [d, 'Farid Haddad', 'Input']),
  // 4. Noise: Hana's work arrives via merges; bots commit often; Sam reformats everything.
  [300, 'Leo Martin', 'Tabs'],
  ...days(260, 200, 120, 60).map((d) => [d, 'Hana Suzuki', 'Tabs via merge']),
  ...days(28, 24, 17, 11, 6, 2).map((d) => [d, 'github-actions[bot]', 'Tabs']),
  ...days(26, 9).map((d) => [d, 'renovate[bot]', 'Tabs']),
  ...days(40, 25, 5).map((d) => [d, 'dependabot[bot]', 'README.md']),
  [20, 'Sam Rivera', '*'],
  // 5. Single contributor, added after the reformat.
  ...days(10, 4).map((d) => [d, 'Dana Whitfield', 'Badge']),
].sort((a, b) => b[0] - a[0]);

const git = (args, env) => execFileSync('git', args, { cwd: out, env: { ...process.env, ...env }, encoding: 'utf8' });
const as = (name, daysAgo) => {
  const email = name.endsWith('[bot]') ? `${name}@users.noreply.github.com` : `${name.toLowerCase().replace(' ', '.')}@example.com`;
  const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_DATE: date };
};

// Double quotes on purpose: the formatting commit converts them.
const files = (c) => ({
  [`src/${c}/${c}.tsx`]: `import React from "react";\n\nexport const ${c} = ({ label = "${c}" }: { label?: string }) => (\n  <div style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}>{label}</div>\n);\n`,
  [`src/${c}/${c}.stories.tsx`]: `import { ${c} } from "./${c}";\n\nexport default { title: "Scenarios/${c}", component: ${c} };\n\nexport const Default = {};\n`,
});

function change(author, target) {
  if (target === '*') {
    for (const f of git(['ls-files']).trim().split('\n')) {
      const p = join(out, f);
      writeFileSync(p, f.endsWith('.tsx') ? readFileSync(p, 'utf8').replaceAll('"', "'") : readFileSync(p, 'utf8') + '\n');
    }
    return 'style: reformat entire codebase';
  }
  if (target.endsWith('.md')) {
    appendFileSync(join(out, target), `Updated by ${author}\n`);
    return `docs: update ${target}`;
  }
  const main = join(out, `src/${target}/${target}.tsx`);
  if (existsSync(main)) {
    appendFileSync(main, `// change by ${author}\n`);
    return `update ${target}`;
  }
  for (const [f, text] of Object.entries(files(target))) {
    mkdirSync(dirname(join(out, f)), { recursive: true });
    writeFileSync(join(out, f), text);
  }
  return `feat: add ${target}`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
git(['init', '-q', '-b', 'main']);
git(['config', 'commit.gpgsign', 'false']);

for (const [daysAgo, author, target] of history) {
  const [component, via] = target.split(' via ');
  if (via) git(['checkout', '-q', '-b', 'feature']);
  const message = change(author, component);
  git(['add', '-A']);
  git(['commit', '-q', '-m', message], as(author, daysAgo));
  if (via) {
    git(['checkout', '-q', 'main']);
    git(['merge', '-q', '--no-ff', '-m', 'Merge branch feature', 'feature'], as('Ivan Petrov', daysAgo - 0.1));
    git(['branch', '-q', '-D', 'feature']);
  }
}

console.log(`Fixture repo generated at ${out} (${git(['rev-list', '--count', 'HEAD']).trim()} commits)`);
