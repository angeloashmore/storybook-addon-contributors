// Node side. Runs git at dev/build time, ranks people per component, and embeds
// the result in the manager page, so the static build works without the repo.
// Emails are used only to group commits and hash for Gravatar; never shipped.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';

export interface Contributor {
  name: string;
  gravatarHash: string; // sha256 of the normalized email
  commits: number;
  score: number; // Σ 0.5^(ageDays / halfLifeDays)
  lastActive: string; // ISO date
}

export interface ContributorsData {
  generatedAt: string;
  halfLifeDays: number;
  /** Keyed by the story file's importPath from the story index. */
  components: Record<string, { files: string[]; contributors: Contributor[] }>;
}

interface Entry {
  type: string;
  importPath: string;
  componentPath?: string;
}

const DAY = 86_400_000;

export function collectContributors(
  entries: Record<string, Entry>,
  { cwd = process.cwd(), halfLifeDays = 182, limit = 10, now = Date.now() } = {},
): ContributorsData {
  const components: ContributorsData['components'] = {};
  for (const entry of Object.values(entries)) {
    if (entry.type !== 'story' || components[entry.importPath]) continue;
    // The component is componentPath when the index has it, else the story's folder.
    const target = entry.componentPath ? resolve(cwd, entry.componentPath) : dirname(resolve(cwd, entry.importPath));
    const people = new Map<string, Contributor & { email: string; last: number }>();

    for (const [name, email, at] of gitLog(target)) {
      if (name.toLowerCase().includes('[bot]')) continue;
      const time = Number(at) * 1000;
      const key = email.trim().toLowerCase();
      const p = people.get(key) ?? { name, email: key, gravatarHash: '', commits: 0, score: 0, last: 0, lastActive: '' };
      if (time >= p.last) Object.assign(p, { name, last: time }); // latest name wins
      p.commits += 1;
      p.score += 0.5 ** (Math.max(0, now - time) / DAY / halfLifeDays);
      people.set(key, p);
    }

    components[entry.importPath] = {
      files: [relative(cwd, target)],
      contributors: [...people.values()]
        .sort((a, b) => b.score - a.score || b.last - a.last)
        .slice(0, limit)
        .map(({ name, email, commits, score, last }) => ({
          name,
          gravatarHash: createHash('sha256').update(email).digest('hex'),
          commits,
          score: Math.round(score * 1000) / 1000,
          lastActive: new Date(last).toISOString(),
        })),
    };
  }
  return { generatedAt: new Date(now).toISOString(), halfLifeDays, components };
}

/** [name, email, unixSeconds] for each non-merge commit touching `path`. */
function gitLog(path: string): string[][] {
  try {
    return execFileSync('git', ['log', '--no-merges', '--format=%an%x1f%ae%x1f%at', '--', path], {
      cwd: dirname(path),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\x1f'));
  } catch {
    return []; // not a git repo
  }
}

// Storybook preset hook: inject the data into the manager's <head>.
export async function managerHead(head = '', options: any) {
  const generator = await options.presets.apply('storyIndexGenerator');
  const { entries } = await generator.getIndex();
  const data = collectContributors(entries, { halfLifeDays: options.halfLifeDays, limit: options.limit });
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `${head}\n<script>window.__COMPONENT_CONTRIBUTORS__ = ${json};</script>\n`;
}
