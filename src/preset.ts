import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const HALF_LIFE_DAYS = 182;
const ACTIVITY_WEIGHT = 0.7;
const AUTHORSHIP_WEIGHT = 0.3;
const MAX_CONTRIBUTORS = 10;
const RECENT_CHANGE_COUNT = 4;
const INACTIVE_AFTER_DAYS = 180;
const LANE_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Change = { message: string; author: string; date: string; url?: string };

export type Contributor = {
  name: string;
  gravatarHash: string;
  commits: number;
  score: number;
  lastActive: string;
  inactiveSince?: string;
  changes: { date: string; message: string }[];
};

export type ComponentContributors = {
  files: string[];
  sourceUrl?: string;
  lastChanged?: string;
  monthlyChanges: number[];
  recentChanges: Change[];
  usedBy: { name: string; storyId: string }[];
  contributors: Contributor[];
};

export type ContributorsData = {
  generatedAt: string;
  components: Record<string, ComponentContributors>;
};

type StoryIndexEntry = {
  id: string;
  type: string;
  title: string;
  importPath: string;
  componentPath?: string;
};

type Commit = {
  sha: string;
  name: string;
  email: string;
  time: number;
  message: string;
  changedLines: number;
};

type Repository = { root: string; url?: string; lastActiveByEmail: Map<string, number> };

let cachedData: Promise<ContributorsData> | undefined;

export async function managerHead(head = "", options: any) {
  return `${head}\n${await dataScript(options)}`;
}

export async function previewHead(head = "", options: any) {
  return `${head}\n${await dataScript(options)}`;
}

async function dataScript(options: any): Promise<string> {
  cachedData ??= options.presets
    .apply("storyIndexGenerator")
    .then((generator: any) => generator.getIndex())
    .then((index: { entries: Record<string, StoryIndexEntry> }) =>
      collectContributors(index.entries),
    );
  const json = JSON.stringify(await cachedData);
  const escapedForScriptTag = json.replaceAll("<", "\\u003c");
  return `<script>window.__STORYBOOK_ADDON_CONTRIBUTORS__ = ${escapedForScriptTag};</script>`;
}

export function collectContributors(entries: Record<string, StoryIndexEntry>): ContributorsData {
  const firstStoryByImportPath = new Map<string, StoryIndexEntry>();
  for (const entry of Object.values(entries)) {
    if (entry.type === "story" && !firstStoryByImportPath.has(entry.importPath)) {
      firstStoryByImportPath.set(entry.importPath, entry);
    }
  }

  const repositories = new Map<string, Repository>();
  const components: ContributorsData["components"] = {};
  for (const [importPath, story] of firstStoryByImportPath) {
    const pathspec = componentPathspec(story);
    const repository = findRepository(dirname(pathspec[0]), repositories);
    components[importPath] = describeComponent(pathspec, repository);
  }

  const importPathByComponentFile = new Map<string, string>();
  for (const [importPath, story] of firstStoryByImportPath) {
    if (story.componentPath)
      importPathByComponentFile.set(resolve(story.componentPath), importPath);
  }
  for (const importer of firstStoryByImportPath.values()) {
    if (!importer.componentPath) continue;
    for (const importedFile of relativeImports(resolve(importer.componentPath))) {
      const importedPath = importPathByComponentFile.get(importedFile);
      if (importedPath && importedPath !== importer.importPath) {
        components[importedPath].usedBy.push({
          name: componentName(importer),
          storyId: importer.id,
        });
      }
    }
  }

  return { generatedAt: new Date().toISOString(), components };
}

function componentPathspec(story: StoryIndexEntry): string[] {
  if (story.componentPath) return [resolve(story.componentPath)];
  return [dirname(resolve(story.importPath)), ":(exclude,glob)**/*.stories.*"];
}

function componentName(story: StoryIndexEntry): string {
  return story.title.split("/").pop()!;
}

function findRepository(cwd: string, repositories: Map<string, Repository>): Repository {
  const root = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  const known = repositories.get(root);
  if (known) return known;

  const lastActiveByEmail = new Map<string, number>();
  const log = git(cwd, ["log", "--no-merges", "--format=%ae%x1f%at"]);
  for (const line of log.split("\n").filter(Boolean)) {
    const [email, timestamp] = line.split("\x1f");
    const key = email.toLowerCase();
    lastActiveByEmail.set(key, Math.max(lastActiveByEmail.get(key) ?? 0, Number(timestamp) * 1000));
  }

  const remote = git(cwd, ["remote", "get-url", "origin"]).trim();
  const repository = { root, url: remote ? webUrl(remote) : undefined, lastActiveByEmail };
  repositories.set(root, repository);
  return repository;
}

function webUrl(remote: string): string {
  return remote
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/\.git$/, "");
}

function describeComponent(pathspec: string[], repository: Repository): ComponentContributors {
  const commits = readCommits(pathspec);

  return {
    files: [relative(process.cwd(), pathspec[0])],
    sourceUrl:
      repository.url && `${repository.url}/blob/HEAD/${relative(repository.root, pathspec[0])}`,
    lastChanged: commits[0] && new Date(commits[0].time).toISOString(),
    monthlyChanges: countChangesPerMonth(commits),
    recentChanges: commits
      .slice(0, RECENT_CHANGE_COUNT)
      .map((commit) => describeChange(commit, repository)),
    usedBy: [],
    contributors: rankContributors(commits, pathspec, repository),
  };
}

function readCommits(pathspec: string[]): Commit[] {
  const cwd = dirname(pathspec[0]);
  const format = "--format=%x1e%H%x1f%an%x1f%ae%x1f%at%x1f%s";
  const log = git(cwd, ["log", "--no-merges", "--numstat", format, "--", ...pathspec]);

  const commits: Commit[] = [];
  for (const record of log.split("\x1e").slice(1)) {
    const [header, ...numstatLines] = record.trim().split("\n");
    const [sha, name, email, timestamp, message] = header.split("\x1f");
    if (name.includes("[bot]")) continue;
    commits.push({
      sha,
      name,
      email: email.toLowerCase(),
      time: Number(timestamp) * 1000,
      message,
      changedLines: countChangedLines(numstatLines),
    });
  }
  return commits;
}

function countChangedLines(numstatLines: string[]): number {
  let total = 0;
  for (const line of numstatLines) {
    const [added, deleted] = line.split("\t");
    total += (Number(added) || 0) + (Number(deleted) || 0);
  }
  return total;
}

function countChangesPerMonth(commits: Commit[]): number[] {
  const months = Array.from({ length: 12 }, () => 0);
  for (const commit of commits) {
    const monthsAgo = Math.floor(daysAgo(commit.time) / 30);
    if (monthsAgo < 12) months[11 - monthsAgo] += 1;
  }
  return months;
}

function describeChange(commit: Commit, repository: Repository): Change {
  const pullRequest = commit.message.match(/^(.*) \(#(\d+)\)$/);
  const url = pullRequest
    ? `${repository.url}/pull/${pullRequest[2]}`
    : `${repository.url}/commit/${commit.sha}`;
  return {
    message: pullRequest ? pullRequest[1] : commit.message,
    author: commit.name,
    date: new Date(commit.time).toISOString(),
    url: repository.url && url,
  };
}

function rankContributors(
  commits: Commit[],
  pathspec: string[],
  repository: Repository,
): Contributor[] {
  const commitsByEmail = new Map<string, Commit[]>();
  for (const commit of commits) {
    commitsByEmail.set(commit.email, [...(commitsByEmail.get(commit.email) ?? []), commit]);
  }

  const activityByEmail = new Map<string, number>();
  for (const [email, personCommits] of commitsByEmail) {
    let activity = 0;
    for (const commit of personCommits)
      activity += recencyWeight(commit.time) * Math.log2(2 + commit.changedLines);
    activityByEmail.set(email, activity);
  }
  const authoredLinesByEmail = countAuthoredLines(pathspec);
  const totalActivity = sum(activityByEmail.values());
  const totalAuthoredLines = sum(authoredLinesByEmail.values()) || 1;

  const contributors = [...commitsByEmail].map(([email, personCommits]): Contributor => {
    const latest = personCommits[0];
    const lastActiveInRepository = repository.lastActiveByEmail.get(email) ?? latest.time;
    const isInactive = daysAgo(lastActiveInRepository) > INACTIVE_AFTER_DAYS;

    return {
      name: latest.name,
      gravatarHash: createHash("sha256").update(email).digest("hex"),
      commits: personCommits.length,
      score:
        ACTIVITY_WEIGHT * (activityByEmail.get(email)! / totalActivity) +
        AUTHORSHIP_WEIGHT * ((authoredLinesByEmail.get(email) ?? 0) / totalAuthoredLines),
      lastActive: new Date(latest.time).toISOString(),
      inactiveSince: isInactive ? new Date(lastActiveInRepository).toISOString() : undefined,
      changes: personCommits
        .filter((commit) => daysAgo(commit.time) <= LANE_DAYS)
        .map((commit) => ({ date: new Date(commit.time).toISOString(), message: commit.message })),
    };
  });

  return contributors
    .sort(
      (left, right) => right.score - left.score || right.lastActive.localeCompare(left.lastActive),
    )
    .slice(0, MAX_CONTRIBUTORS);
}

function countAuthoredLines(pathspec: string[]): Map<string, number> {
  const cwd = dirname(pathspec[0]);
  const linesByEmail = new Map<string, number>();
  for (const file of git(cwd, ["ls-files", "--", ...pathspec])
    .split("\n")
    .filter(Boolean)) {
    const blame = git(cwd, ["blame", "--line-porcelain", "-w", "-M", "--", file]);
    for (const [, email] of blame.matchAll(/^author-mail <(.*)>$/gm)) {
      const key = email.toLowerCase();
      linesByEmail.set(key, (linesByEmail.get(key) ?? 0) + 1);
    }
  }
  return linesByEmail;
}

function relativeImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const imports: string[] = [];
  for (const [, specifier] of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const base = resolve(dirname(file), specifier);
    const candidates = [".tsx", ".ts", ".jsx", ".js"].flatMap((extension) => [
      base + extension,
      `${base}/index${extension}`,
    ]);
    const match = [base, ...candidates].find((candidate) =>
      statSync(candidate, { throwIfNoEntry: false })?.isFile(),
    );
    if (match) imports.push(match);
  }
  return imports;
}

function recencyWeight(time: number): number {
  return 0.5 ** (daysAgo(time) / HALF_LIFE_DAYS);
}

function daysAgo(time: number): number {
  return (Date.now() - time) / DAY_MS;
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
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
