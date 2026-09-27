#!/usr/bin/env node
// Generates example/fixture: a standalone git repo with scripted history.
// Every commit gets a fake author and a date relative to "now", so recency
// results stay stable no matter when the script runs.
//
// Usage: node example/scripts/generate-fixture.mjs [outDir]

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? join(here, '..', 'fixture'));
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

// ---------------------------------------------------------------------------
// People. Emails use example.com and never reach the browser.
// ---------------------------------------------------------------------------
const P = {
  priya: { name: 'Priya Patel', email: 'priya.patel@example.com' },
  marcus: { name: 'Marcus Lee', email: 'marcus.lee@example.com' },
  alice: { name: 'Alice Chen', email: 'alice.chen@example.com' },
  ben: { name: 'Ben Okafor', email: 'ben.okafor@example.com' },
  elena: { name: 'Elena Rossi', email: 'elena.rossi@example.com' },
  farid: { name: 'Farid Haddad', email: 'farid.haddad@example.com' },
  george: { name: 'George Novak', email: 'george.novak@example.com' },
  hana: { name: 'Hana Suzuki', email: 'hana.suzuki@example.com' },
  leo: { name: 'Leo Martin', email: 'leo.martin@example.com' },
  ivan: { name: 'Ivan Petrov', email: 'ivan.petrov@example.com' },
  sam: { name: 'Sam Rivera', email: 'sam.rivera@example.com' },
  dana: { name: 'Dana Whitfield', email: 'dana.whitfield@example.com' },
  actionsBot: { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' },
  renovateBot: { name: 'renovate[bot]', email: '29139614+renovate[bot]@users.noreply.github.com' },
  dependabot: { name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com' },
};

// ---------------------------------------------------------------------------
// File templates (double quotes on purpose: the formatting commit converts them)
// ---------------------------------------------------------------------------
const component = (name, body) => `import React from "react";

${body}
`;

const story = (name, args) => `import type { Meta, StoryObj } from "@storybook/react-vite";

import { ${name} } from "./${name}";

const meta = {
  title: "Scenarios/${name}",
  component: ${name},
} satisfies Meta<typeof ${name}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: ${JSON.stringify(args)},
};
`;

const FILES = {
  Button: component(
    'Button',
    `export interface ButtonProps {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}

export const Button = ({ label, primary = false, onClick }: ButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    style={{ padding: "8px 16px", border: "none", borderRadius: 4, background: primary ? "#1ea7fd" : "#e5e7eb", color: primary ? "white" : "#111" }}
  >
    {label}
  </button>
);`,
  ),
  Card: component(
    'Card',
    `export interface CardProps {
  title: string;
  children?: React.ReactNode;
}

export const Card = ({ title, children }: CardProps) => (
  <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, maxWidth: 320 }}>
    <h3 style={{ marginTop: 0 }}>{title}</h3>
    <div>{children}</div>
  </section>
);`,
  ),
  Input: component(
    'Input',
    `export interface InputProps {
  label: string;
  placeholder?: string;
}

export const Input = ({ label, placeholder }: InputProps) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 240 }}>
    <span>{label}</span>
    <input placeholder={placeholder} style={{ padding: 6, border: "1px solid #aaa", borderRadius: 4 }} />
  </label>
);`,
  ),
  Tabs: component(
    'Tabs',
    `export interface TabsProps {
  tabs: string[];
  initial?: number;
}

export const Tabs = ({ tabs, initial = 0 }: TabsProps) => {
  const [active, setActive] = React.useState(initial);
  return (
    <div role="tablist" style={{ display: "flex", gap: 8 }}>
      {tabs.map((tab, i) => (
        <button key={tab} role="tab" aria-selected={i === active} onClick={() => setActive(i)}>
          {tab}
        </button>
      ))}
    </div>
  );
};`,
  ),
  Badge: component(
    'Badge',
    `export interface BadgeProps {
  text: string;
}

export const Badge = ({ text }: BadgeProps) => (
  <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fde68a", fontSize: 12 }}>{text}</span>
);`,
  ),
};

const ARGS = {
  Button: { label: 'Save', primary: true },
  Card: { title: 'Hello', children: 'Card body' },
  Input: { label: 'Email', placeholder: 'Type here' },
  Tabs: { tabs: ['One', 'Two', 'Three'] },
  Badge: { text: 'New' },
};

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------
function git(args, env = {}) {
  return execFileSync('git', args, { cwd: outDir, env: { ...process.env, ...env }, encoding: 'utf8' });
}

function envFor(person, daysAgo, committer = person) {
  const date = new Date(now - daysAgo * DAY).toISOString();
  return {
    GIT_AUTHOR_NAME: person.name,
    GIT_AUTHOR_EMAIL: person.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: committer.name,
    GIT_COMMITTER_EMAIL: committer.email,
    GIT_COMMITTER_DATE: date,
  };
}

function write(path, content) {
  const abs = join(outDir, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function append(path, line) {
  const abs = join(outDir, path);
  writeFileSync(abs, readFileSync(abs, 'utf8') + line + '\n');
}

const src = (name) => `src/${name}/${name}.tsx`;
const stories = (name) => `src/${name}/${name}.stories.tsx`;

// ---------------------------------------------------------------------------
// History. Each event is { daysAgo, run }. Events are sorted oldest first.
// ---------------------------------------------------------------------------
const events = [];
const commit = (daysAgo, person, message, change) =>
  events.push({
    daysAgo,
    run() {
      change();
      git(['add', '-A']);
      git(['commit', '-q', '-m', message], envFor(person, daysAgo));
    },
  });

// A small change to a component file (valid TSX: a trailing comment).
const tweak = (name, message) => () => append(src(name), `// ${message}`);

const create = (name) => () => {
  write(src(name), FILES[name]);
  write(stories(name), story(name, ARGS[name]));
};

// Repo scaffolding, long ago.
commit(800, P.ivan, 'chore: initial repo setup', () => {
  write('README.md', '# Acme UI\n\nShared React components.\n');
  write('package.json', JSON.stringify({ name: 'acme-ui', private: true, version: '0.1.0' }, null, 2) + '\n');
});

// Scenario 1 — Clear owner (Button): Priya did most of the work, recently.
commit(260, P.marcus, 'feat(Button): add Button component', create('Button'));
commit(200, P.marcus, 'fix(Button): focus outline', tweak('Button', 'focus outline'));
[120, 90, 70, 50, 35, 21, 8].forEach((d, i) =>
  commit(d, P.priya, `feat(Button): iteration ${i + 1}`, tweak('Button', `Priya change ${i + 1}`)),
);

// Scenario 2 — Faded original author (Card): Alice ~2 years ago, Ben recently.
commit(760, P.alice, 'feat(Card): add Card component', create('Card'));
[750, 745, 738, 730, 722, 715, 708, 700, 695, 690, 685].forEach((d, i) =>
  commit(d, P.alice, `feat(Card): improvement ${i + 1}`, tweak('Card', `Alice change ${i + 1}`)),
);
[90, 45, 15].forEach((d, i) =>
  commit(d, P.ben, `fix(Card): update ${i + 1}`, tweak('Card', `Ben change ${i + 1}`)),
);

// Scenario 3 — Shared (Input): Elena and Farid, similar and recent.
commit(520, P.george, 'feat(Input): add Input component', create('Input'));
commit(500, P.george, 'fix(Input): label spacing', tweak('Input', 'George label spacing'));
[110, 75, 40, 12].forEach((d, i) =>
  commit(d, P.elena, `feat(Input): validation step ${i + 1}`, tweak('Input', `Elena change ${i + 1}`)),
);
[105, 80, 35, 18].forEach((d, i) =>
  commit(d, P.farid, `feat(Input): a11y step ${i + 1}`, tweak('Input', `Farid change ${i + 1}`)),
);

// Scenario 4 — Noise (Tabs): Hana is the real contributor. Her work lands
// through merge commits by Ivan (skipped), bots commit often (skipped), and
// Sam's formatting commit (below) touches every file.
commit(300, P.leo, 'feat(Tabs): add Tabs component', create('Tabs'));
[260, 200, 120, 60].forEach((d, i) =>
  events.push({
    daysAgo: d,
    run() {
      const branch = `feature/tabs-${i + 1}`;
      git(['checkout', '-q', '-b', branch]);
      tweak('Tabs', `Hana change ${i + 1}`)();
      git(['add', '-A']);
      git(['commit', '-q', '-m', `feat(Tabs): keyboard support part ${i + 1}`], envFor(P.hana, d));
      git(['checkout', '-q', 'main']);
      git(['merge', '-q', '--no-ff', '-m', `Merge branch '${branch}'`, branch], envFor(P.ivan, d - 0.1));
      git(['branch', '-q', '-d', branch]);
    },
  }),
);
[28, 24, 17, 11, 6, 2].forEach((d, i) =>
  commit(d, P.actionsBot, `chore: auto-fix lint (${i + 1})`, tweak('Tabs', `lint autofix ${i + 1}`)),
);
[26, 9].forEach((d, i) =>
  commit(d, P.renovateBot, `chore(deps): update types (${i + 1})`, tweak('Tabs', `renovate ${i + 1}`)),
);
[40, 25, 5].forEach((d, i) =>
  commit(d, P.dependabot, `chore(deps): bump deps (${i + 1})`, () =>
    append('README.md', `<!-- deps bump ${i + 1} -->`),
  ),
);

// The big formatting commit: double -> single quotes in every file.
commit(20, P.sam, 'style: reformat entire codebase with new quote style', () => {
  for (const file of listFiles(outDir)) {
    const abs = join(outDir, file);
    if (file.endsWith('.tsx')) writeFileSync(abs, readFileSync(abs, 'utf8').replaceAll('"', "'"));
    else if (file.endsWith('.json')) writeFileSync(abs, JSON.stringify(JSON.parse(readFileSync(abs, 'utf8')), null, 4) + '\n');
    else writeFileSync(abs, readFileSync(abs, 'utf8').trimEnd() + '\n\n');
  }
});

// Scenario 5 — Single contributor (Badge): added by Dana after the reformat.
commit(10, P.dana, 'feat(Badge): add Badge component', create('Badge'));
commit(4, P.dana, 'feat(Badge): tweak colors', tweak('Badge', 'Dana colors'));

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      if (entry === '.git') continue;
      const abs = join(d, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(relative(dir, abs));
    }
  };
  walk(dir);
  return out;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
git(['init', '-q', '-b', 'main']);
git(['config', 'commit.gpgsign', 'false']);
git(['config', 'user.name', 'Fixture Generator']);
git(['config', 'user.email', 'fixture@example.com']);

events.sort((a, b) => b.daysAgo - a.daysAgo);
for (const event of events) event.run();

const count = git(['rev-list', '--count', 'HEAD']).trim();
console.log(`Fixture repo generated at ${outDir} (${count} commits)`);
