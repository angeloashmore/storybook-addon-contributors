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
const EDIT_MESSAGES = [
  "Fix spacing in",
  "Improve accessibility of",
  "Refine styles for",
  "Handle long labels in",
  "Tidy up",
];

const history = [
  ...commits("Ivan Petrov", "README.md", [800], "docs"),

  ...commits("Marcus Lee", "Button", [260, 200]),
  ...commits("Priya Patel", "Button", [120, 90, 70, 50, 35, 21, 8]),
  ...commits("Quinn Harper", "Button", [7, 5, 3, 1], "story"),

  ...commits("Alice Chen", "Card", [760, 750, 745, 738, 730, 722, 715, 708, 700, 695, 690, 685]),
  ...commits("Ben Okafor", "Card", [90, 45, 15], "revise"),

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
git(["remote", "add", "origin", "https://github.com/acme/design-system.git"]);

let pullRequestNumber = 100;
for (const commit of history) {
  if (commit.kind === "merge") git(["checkout", "-q", "-b", "feature"]);

  pullRequestNumber += 1;
  const change = applyChange(commit, pullRequestNumber);
  const message = commit.author.endsWith("[bot]") ? change : `${change} (#${pullRequestNumber})`;
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

function applyChange({ author, target, kind }, pullRequestNumber) {
  const componentFile = `${FIXTURE_DIR}src/${target}/${target}.tsx`;
  const storyFile = `${FIXTURE_DIR}src/${target}/${target}.stories.tsx`;

  switch (kind) {
    case "docs":
      appendFileSync(FIXTURE_DIR + target, `Updated by ${author}\n`);
      return `Update ${target}`;
    case "story":
      appendFileSync(storyFile, `// story tweak by ${author}\n`);
      return `Add examples to ${target} stories`;
    case "reformat":
      reformatAllFiles();
      return "Reformat codebase with new quote style";
    case "rewrite":
      writeFileSync(componentFile, rewrittenComponentSource(target));
      return `Rewrite ${target}`;
    case "revise":
      appendFileSync(componentFile, revisionSource(target, pullRequestNumber));
      return `Add spacing presets to ${target}`;
  }

  if (!existsSync(componentFile)) return createComponent(target, componentSource(target));

  appendFileSync(componentFile, `// change by ${author}\n`);
  if (author.endsWith("[bot]")) return `chore(${target}): apply automated fixes`;
  return `${EDIT_MESSAGES[pullRequestNumber % EDIT_MESSAGES.length]} ${target}`;
}

function createComponent(name, source) {
  mkdirSync(`${FIXTURE_DIR}src/${name}`, { recursive: true });
  writeFileSync(`${FIXTURE_DIR}src/${name}/${name}.tsx`, source);
  writeFileSync(`${FIXTURE_DIR}src/${name}/${name}.stories.tsx`, storySource(name));
  return `Add ${name} component`;
}

function reformatAllFiles() {
  for (const file of git(["ls-files"]).trim().split("\n")) {
    const path = FIXTURE_DIR + file;
    const text = readFileSync(path, "utf8");
    writeFileSync(path, file.endsWith(".tsx") ? text.replaceAll('"', "'") : `${text}\n`);
  }
}

function componentSource(name) {
  if (name === "Card") return cardSource();
  return `import React from "react";

export const ${name} = ({ label = "${name}" }: { label?: string }) => (
  <div style={{ padding: 8, border: "1px solid #ccc", borderRadius: 4 }}>{label}</div>
);
`;
}

function revisionSource(name, pullRequestNumber) {
  return `
export const ${name.toLowerCase()}Spacing${pullRequestNumber} = {
  compact: ${pullRequestNumber % 8},
  regular: ${(pullRequestNumber % 8) + 8},
  roomy: ${(pullRequestNumber % 8) + 16},
};
`;
}

function cardSource() {
  return `import React from "react";

type CardProps = {
  title?: string;
  description?: string;
  linkLabel?: string;
};

export const Card = ({
  title = "Shipping to Canada",
  description = "Orders arrive in 3 to 5 business days. Duties and taxes are paid at checkout, so nothing is due on delivery.",
  linkLabel = "Read the shipping guide",
}: CardProps) => (
  <article
    style={{
      maxWidth: 360,
      padding: 24,
      border: "1px solid #e7e5e4",
      borderRadius: 6,
      background: "#ffffff",
      color: "#1c1917",
    }}
  >
    <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 400 }}>{title}</h3>
    <p style={{ margin: "10px 0 18px", fontFamily: "system-ui, sans-serif", fontSize: 15, lineHeight: 1.55, color: "#57534e" }}>
      {description}
    </p>
    <a
      href="#"
      style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 600, color: "#1c1917", textUnderlineOffset: 3 }}
    >
      {linkLabel}
    </a>
  </article>
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
