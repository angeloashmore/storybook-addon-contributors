// Generates example/fixture: a separate git repo with scripted history. Commits
// get fake authors and dates relative to now, so recency results stay stable.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = new URL('../fixture/', import.meta.url).pathname;
const commits = (author, target, daysAgo, merge) => daysAgo.map((d) => [d, author, target, merge]);

// The first commit to a component creates it; later ones edit it. "*" is the big
// formatting commit touching every file. `merge` commits land on a branch that
// Ivan merges with --no-ff.
const history = [
  ...commits('Ivan Petrov', 'README.md', [800]),
  // 1. Clear owner: Priya made most commits, recently.
  ...commits('Marcus Lee', 'Button', [260, 200]),
  ...commits('Priya Patel', 'Button', [120, 90, 70, 50, 35, 21, 8]),
  // 2. Faded original author: Alice ~2 years ago, Ben fewer but recent.
  ...commits('Alice Chen', 'Card', [760, 750, 745, 738, 730, 722, 715, 708, 700, 695, 690, 685]),
  ...commits('Ben Okafor', 'Card', [90, 45, 15]),
  // 3. Shared: Elena and Farid, similar and recent.
  ...commits('George Novak', 'Input', [520, 500]),
  ...commits('Elena Rossi', 'Input', [110, 75, 40, 12]),
  ...commits('Farid Haddad', 'Input', [105, 80, 35, 18]),
  // 4. Noise: Hana's work arrives via merges; bots commit often; Sam reformats everything.
  ...commits('Leo Martin', 'Tabs', [300]),
  ...commits('Hana Suzuki', 'Tabs', [260, 200, 120, 60], 'merge'),
  ...commits('github-actions[bot]', 'Tabs', [28, 24, 17, 11, 6, 2]),
  ...commits('renovate[bot]', 'Tabs', [26, 9]),
  ...commits('dependabot[bot]', 'README.md', [40, 25, 5]),
  ...commits('Sam Rivera', '*', [20]),
  // 5. Single contributor, added after the reformat.
  ...commits('Dana Whitfield', 'Badge', [10, 4]),
].sort((a, b) => b[0] - a[0]);

const git = (args, env) => execFileSync('git', args, { cwd: out, env: { ...process.env, ...env }, encoding: 'utf8' });
const as = (name, daysAgo) => {
  const email = name.endsWith('[bot]') ? `${name}@users.noreply.github.com` : `${name.toLowerCase().replace(' ', '.')}@example.com`;
  const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_DATE: date };
};

function change(author, target) {
  if (target === '*') {
    for (const f of git(['ls-files']).trim().split('\n')) {
      const text = readFileSync(out + f, 'utf8');
      writeFileSync(out + f, f.endsWith('.tsx') ? text.replaceAll('"', "'") : text + '\n');
    }
    return 'style: reformat entire codebase';
  }
  if (target.endsWith('.md')) {
    appendFileSync(out + target, `Updated by ${author}\n`);
    return `docs: update ${target}`;
  }
  const dir = `${out}src/${target}/`;
  if (existsSync(dir)) {
    appendFileSync(`${dir}${target}.tsx`, `// change by ${author}\n`);
    return `update ${target}`;
  }
  // Double quotes on purpose: the formatting commit converts them.
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${target}.tsx`, `import React from "react";\n\nexport const ${target} = ({ label = "${target}" }: { label?: string }) => (\n  <div style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}>{label}</div>\n);\n`);
  writeFileSync(`${dir}${target}.stories.tsx`, `import { ${target} } from "./${target}";\n\nexport default { title: "Scenarios/${target}", component: ${target} };\n\nexport const Default = {};\n`);
  return `feat: add ${target}`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
git(['init', '-q', '-b', 'main']);
git(['config', 'commit.gpgsign', 'false']);

for (const [daysAgo, author, target, merge] of history) {
  if (merge) git(['checkout', '-q', '-b', 'feature']);
  const message = change(author, target);
  git(['add', '-A']);
  git(['commit', '-q', '-m', message], as(author, daysAgo));
  if (merge) {
    git(['checkout', '-q', 'main']);
    git(['merge', '-q', '--no-ff', '-m', 'Merge branch feature', 'feature'], as('Ivan Petrov', daysAgo - 0.1));
    git(['branch', '-q', '-D', 'feature']);
  }
}

console.log(`Fixture repo generated at ${out} (${git(['rev-list', '--count', 'HEAD']).trim()} commits)`);
