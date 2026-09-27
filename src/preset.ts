import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";

const HALF_LIFE_DAYS = 182;
const ACTIVITY_WEIGHT = 0.7;
const AUTHORSHIP_WEIGHT = 0.3;
const MAX_CONTRIBUTORS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Contributor = {
  name: string;
  gravatarHash: string;
  commits: number;
  score: number;
  lastActive: string;
};

export type ContributorsData = {
  generatedAt: string;
  components: Record<string, { files: string[]; contributors: Contributor[] }>;
};

type StoryIndexEntry = { type: string; importPath: string; componentPath?: string };

type Person = {
  email: string;
  name: string;
  commits: number;
  activity: number;
  authoredLines: number;
  lastCommitTime: number;
};

export function collectContributors(entries: Record<string, StoryIndexEntry>): ContributorsData {
  const components: ContributorsData["components"] = {};

  for (const entry of Object.values(entries)) {
    if (entry.type !== "story" || components[entry.importPath]) continue;

    const pathspec = componentPathspec(entry);
    const people = rankPeople(pathspec).slice(0, MAX_CONTRIBUTORS);

    components[entry.importPath] = {
      files: [relative(process.cwd(), pathspec[0])],
      contributors: people.map((person) => ({
        name: person.name,
        gravatarHash: createHash("sha256").update(person.email).digest("hex"),
        commits: person.commits,
        score: person.score,
        lastActive: new Date(person.lastCommitTime).toISOString(),
      })),
    };
  }

  return { generatedAt: new Date().toISOString(), components };
}

export async function managerHead(head = "", options: any) {
  const storyIndexGenerator = await options.presets.apply("storyIndexGenerator");
  const { entries } = await storyIndexGenerator.getIndex();
  const json = JSON.stringify(collectContributors(entries));
  const escapedForScriptTag = json.replaceAll("<", "\\u003c");
  return `${head}\n<script>window.__STORYBOOK_ADDON_CONTRIBUTORS__ = ${escapedForScriptTag};</script>\n`;
}

function componentPathspec(entry: StoryIndexEntry): string[] {
  if (entry.componentPath) return [resolve(entry.componentPath)];
  return [dirname(resolve(entry.importPath)), ":(exclude,glob)**/*.stories.*"];
}

function rankPeople(pathspec: string[]): (Person & { score: number })[] {
  const cwd = dirname(pathspec[0]);
  const peopleByEmail = new Map<string, Person>();

  const log = git(cwd, [
    "log",
    "--no-merges",
    "--numstat",
    "--format=%x1e%an%x1f%ae%x1f%at",
    "--",
    ...pathspec,
  ]);
  for (const commit of log.split("\x1e").slice(1)) {
    const [header, ...numstatLines] = commit.trim().split("\n");
    const [name, email, timestamp] = header.split("\x1f");
    if (name.includes("[bot]")) continue;

    const key = email.toLowerCase();
    const person = peopleByEmail.get(key) ?? {
      email: key,
      name,
      commits: 0,
      activity: 0,
      authoredLines: 0,
      lastCommitTime: 0,
    };
    peopleByEmail.set(key, person);

    const time = Number(timestamp) * 1000;
    if (time > person.lastCommitTime) {
      person.name = name;
      person.lastCommitTime = time;
    }
    person.commits += 1;
    person.activity += recencyWeight(time) * Math.log2(2 + countChangedLines(numstatLines));
  }

  for (const file of git(cwd, ["ls-files", "--", ...pathspec])
    .split("\n")
    .filter(Boolean)) {
    const blame = git(cwd, ["blame", "--line-porcelain", "-w", "-M", "--", file]);
    for (const [, email] of blame.matchAll(/^author-mail <(.*)>$/gm)) {
      const person = peopleByEmail.get(email.toLowerCase());
      if (person) person.authoredLines += 1;
    }
  }

  const people = [...peopleByEmail.values()];
  const totalActivity = people.reduce((total, person) => total + person.activity, 0);
  const totalAuthoredLines = people.reduce((total, person) => total + person.authoredLines, 0) || 1;

  return people
    .map((person) => ({
      ...person,
      score:
        ACTIVITY_WEIGHT * (person.activity / totalActivity) +
        AUTHORSHIP_WEIGHT * (person.authoredLines / totalAuthoredLines),
    }))
    .sort((left, right) => right.score - left.score || right.lastCommitTime - left.lastCommitTime);
}

function recencyWeight(time: number): number {
  const ageInDays = (Date.now() - time) / DAY_MS;
  return 0.5 ** (ageInDays / HALF_LIFE_DAYS);
}

function countChangedLines(numstatLines: string[]): number {
  let total = 0;
  for (const line of numstatLines) {
    const [added, deleted] = line.split("\t");
    total += (Number(added) || 0) + (Number(deleted) || 0);
  }
  return total;
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}
