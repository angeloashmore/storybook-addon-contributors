import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const FIXTURE_DIR = new URL("../fixture/", import.meta.url).pathname;
const DAY_MS = 24 * 60 * 60 * 1000;

const history = [
  ...commits("Ivan Petrov", "README.md", [800], "docs"),

  ...commits("Marcus Lee", "Button", [260, 200]),
  ...commits("Priya Patel", "Button", [120, 90, 70, 50, 35, 21, 8]),
  ...commits("Quinn Harper", "Button", [7, 5, 3, 1], "story"),

  ...commits("Alice Chen", "Card", [760, 750, 745, 738, 730, 722, 715, 708, 700, 695, 690, 685]),
  ...commits("Ben Okafor", "Card", [90, 45, 15]),

  ...commits("George Novak", "Input", [520, 500]),
  ...commits("Elena Rossi", "Input", [110, 75, 40, 12]),
  ...commits("Farid Haddad", "Input", [105, 80, 35, 18]),

  ...commits("Leo Martin", "Tabs", [300]),
  ...commits("Hana Suzuki", "Tabs", [260, 200, 120, 60], "merge"),
  ...commits("github-actions[bot]", "Tabs", [28, 24, 17, 11, 6, 2]),
  ...commits("renovate[bot]", "Tabs", [26, 9]),
  ...commits("dependabot[bot]", "README.md", [40, 25, 5], "docs"),
  ...commits("Sam Rivera", "everything", [20], "reformat"),

  ...commits("Paul Grant", "Dialog", [700, 650]),
  ...commits("Nora Blake", "Dialog", [45], "rewrite"),
  ...commits("Omar Farouk", "Dialog", [40, 30, 25, 15, 10]),

  ...commits("Dana Whitfield", "Badge", [10, 4]),
].sort((left, right) => right.daysAgo - left.daysAgo);

rmSync(FIXTURE_DIR, { recursive: true, force: true });
mkdirSync(FIXTURE_DIR);
git(["init", "-q", "-b", "main"]);
git(["config", "commit.gpgsign", "false"]);

for (const commit of history) {
  if (commit.kind === "merge") git(["checkout", "-q", "-b", "feature"]);

  const message = applyChange(commit);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", message], identity(commit.author, commit.daysAgo));

  if (commit.kind === "merge") {
    git(["checkout", "-q", "main"]);
    git(
      ["merge", "-q", "--no-ff", "-m", "Merge branch feature", "feature"],
      identity("Ivan Petrov", commit.daysAgo),
    );
    git(["branch", "-q", "-D", "feature"]);
  }
}

console.log(
  `Fixture repo generated at ${FIXTURE_DIR} (${git(["rev-list", "--count", "HEAD"]).trim()} commits)`,
);

function commits(author, target, daysAgoList, kind = "edit") {
  return daysAgoList.map((daysAgo) => ({ author, target, daysAgo, kind }));
}

function applyChange({ author, target, kind }) {
  const componentFile = `${FIXTURE_DIR}src/${target}/${target}.tsx`;
  const storyFile = `${FIXTURE_DIR}src/${target}/${target}.stories.tsx`;

  switch (kind) {
    case "docs":
      appendFileSync(FIXTURE_DIR + target, `Updated by ${author}\n`);
      return `docs: update ${target}`;
    case "story":
      appendFileSync(storyFile, `// story tweak by ${author}\n`);
      return `docs: tweak ${target} story`;
    case "reformat":
      reformatAllFiles();
      return "style: reformat entire codebase";
    case "rewrite":
      writeFileSync(componentFile, rewrittenComponentSource(target));
      return `refactor: rewrite ${target}`;
  }

  if (existsSync(componentFile)) {
    appendFileSync(componentFile, `// change by ${author}\n`);
    return `update ${target}`;
  }

  mkdirSync(`${FIXTURE_DIR}src/${target}`, { recursive: true });
  writeFileSync(componentFile, componentSource(target));
  writeFileSync(storyFile, storySource(target));
  return `feat: add ${target}`;
}

function reformatAllFiles() {
  for (const file of git(["ls-files"]).trim().split("\n")) {
    const path = FIXTURE_DIR + file;
    const text = readFileSync(path, "utf8");
    writeFileSync(path, file.endsWith(".tsx") ? text.replaceAll('"', "'") : `${text}\n`);
  }
}

function componentSource(name) {
  return `import React from "react";

export const ${name} = ({ label = "${name}" }: { label?: string }) => (
  <div style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}>{label}</div>
);
`;
}

function rewrittenComponentSource(name) {
  const steps = Array.from(
    { length: 40 },
    (_, index) => `  { id: ${index + 1}, done: ${index % 2 === 0} },`,
  );
  return `import React from "react";

const steps = [
${steps.join("\n")}
];

export const ${name} = ({ label = "${name}" }: { label?: string }) => (
  <div role="dialog">
    {label}: {steps.filter((step) => step.done).length} of {steps.length} done
  </div>
);
`;
}

function storySource(name) {
  return `import { ${name} } from "./${name}";

export default { title: "Scenarios/${name}", component: ${name} };

export const Default = {};
`;
}

function identity(name, daysAgo) {
  const email = name.endsWith("[bot]")
    ? `${name}@users.noreply.github.com`
    : `${name.toLowerCase().replace(" ", ".")}@example.com`;
  const date = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
    GIT_COMMITTER_DATE: date,
  };
}

function git(args, environment = {}) {
  return execFileSync("git", args, {
    cwd: FIXTURE_DIR,
    env: { ...process.env, ...environment },
    encoding: "utf8",
  });
}
