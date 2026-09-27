// Node-only: reads local git history and ranks the people who worked on each
// component. The output is safe to ship to the browser: emails are used only
// to group commits and compute the Gravatar hash, and are never included.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';

import type { ComponentContributors, Contributor, ContributorsData } from './types';

export interface CollectOptions {
  /** Directory that relative index paths resolve against (Storybook's working dir). */
  cwd?: string;
  /** A commit's weight halves every `halfLifeDays` days. Default: ~6 months. */
  halfLifeDays?: number;
  /** Max people to keep per component. */
  limit?: number;
  /** Reference time for recency. Default: now. */
  now?: number;
}

/** The subset of a Storybook story index entry we need. */
export interface IndexEntryLike {
  type: string;
  importPath: string;
  componentPath?: string;
  title: string;
}

export const DEFAULT_HALF_LIFE_DAYS = 182;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Commit {
  name: string;
  email: string;
  time: number; // ms
}

/**
 * Build contributor data for every story file in a story index.
 * Keyed by the story file's `importPath`, which the manager can look up from
 * the current story.
 */
export function collectContributors(
  entries: Record<string, IndexEntryLike> | IndexEntryLike[],
  options: CollectOptions = {},
): ContributorsData {
  const cwd = options.cwd ?? process.cwd();
  const halfLifeDays = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const list = Array.isArray(entries) ? entries : Object.values(entries);
  const components: Record<string, ComponentContributors> = {};

  for (const entry of list) {
    if (entry.type !== 'story' || components[entry.importPath]) continue;
    const files = componentFiles(entry, cwd);
    const contributors = rankContributors(gitLog(files), { ...options, halfLifeDays });
    components[entry.importPath] = {
      title: entry.title,
      files: files.map((f) => relative(cwd, f)),
      contributors,
    };
  }

  return { generatedAt: new Date(options.now ?? Date.now()).toISOString(), halfLifeDays, components };
}

/** componentPath when the index provides it, otherwise the story file's folder. */
export function componentFiles(entry: IndexEntryLike, cwd: string): string[] {
  if (entry.componentPath) return [resolve(cwd, entry.componentPath)];
  return [dirname(resolve(cwd, entry.importPath))];
}

/** Non-merge commits touching any of `paths`. Returns [] outside a git repo. */
export function gitLog(paths: string[]): Commit[] {
  if (paths.length === 0) return [];
  const SEP = '\x1f';
  let out: string;
  try {
    out = execFileSync(
      'git',
      ['log', '--no-merges', `--format=%an${SEP}%ae${SEP}%at`, '--', ...paths],
      { cwd: dirname(paths[0]), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return [];
  }
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, email, at] = line.split(SEP);
      return { name, email, time: Number(at) * 1000 };
    });
}

export function isBot(name: string): boolean {
  return name.toLowerCase().includes('[bot]');
}

export function gravatarHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Group commits by email and rank by recency-weighted score. */
export function rankContributors(
  commits: Commit[],
  options: { halfLifeDays?: number; now?: number; limit?: number } = {},
): Contributor[] {
  const halfLifeDays = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const now = options.now ?? Date.now();
  const byEmail = new Map<string, { name: string; nameTime: number; commits: number; score: number; last: number; email: string }>();

  for (const c of commits) {
    if (isBot(c.name)) continue;
    const key = c.email.trim().toLowerCase();
    const ageDays = Math.max(0, (now - c.time) / DAY_MS);
    const weight = Math.pow(0.5, ageDays / halfLifeDays);
    const p = byEmail.get(key) ?? { name: c.name, nameTime: c.time, commits: 0, score: 0, last: 0, email: key };
    // Use the most recent name seen for this email.
    if (c.time >= p.nameTime) {
      p.name = c.name;
      p.nameTime = c.time;
    }
    p.commits += 1;
    p.score += weight;
    p.last = Math.max(p.last, c.time);
    byEmail.set(key, p);
  }

  const ranked = [...byEmail.values()]
    .sort((a, b) => b.score - a.score || b.last - a.last)
    .map(
      (p): Contributor => ({
        name: p.name,
        gravatarHash: gravatarHash(p.email),
        commits: p.commits,
        score: Math.round(p.score * 1000) / 1000,
        lastActive: new Date(p.last).toISOString(),
      }),
    );
  return options.limit ? ranked.slice(0, options.limit) : ranked;
}
