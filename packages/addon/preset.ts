// Runs git at dev/build time and embeds the ranking in the manager page, so the
// static build works without the repo. Emails never leave this file: they only
// group commits and feed the Gravatar hash.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';

export interface Contributor {
  name: string;
  gravatarHash: string;
  commits: number;
  /** 0–1: 70% share of recent activity + 30% share of today's lines. */
  score: number;
  lastActive: string;
}

export interface ContributorsData {
  generatedAt: string;
  /** Keyed by the story file's importPath. */
  components: Record<string, { files: string[]; contributors: Contributor[] }>;
}

export function collectContributors(
  entries: Record<string, { type: string; importPath: string; componentPath?: string }>,
): ContributorsData {
  const components: ContributorsData['components'] = {};
  for (const { type, importPath, componentPath } of Object.values(entries)) {
    if (type !== 'story' || components[importPath]) continue;
    // Track what the story shows, not the story: the component file, or the
    // story's folder minus story files when the index has no componentPath.
    const target = componentPath ? resolve(componentPath) : dirname(resolve(importPath));
    const pathspec = componentPath ? [target] : [target, ':(exclude,glob)**/*.stories.*'];
    const people = rankPeople(dirname(target), pathspec);

    components[importPath] = {
      files: [relative(process.cwd(), target)],
      contributors: people.slice(0, 10).map(({ email, name, commits, score, last }) => ({
          name,
          gravatarHash: createHash('sha256').update(email).digest('hex'),
          commits,
          score: Math.round(score * 1000) / 1000,
          lastActive: new Date(last).toISOString(),
        })),
    };
  }
  return { generatedAt: new Date().toISOString(), components };
}

// Who to talk to = who has been involved recently (70%) + who wrote the code as
// it is today (30%). Activity: each commit counts 0.5^(age in days / 182), scaled
// by log2(2 + lines changed) so a rewrite outweighs a one-line tweak without
// letting a huge mechanical change swamp everything. Authorship: `git blame`
// line counts, ignoring whitespace and moved lines.
function rankPeople(cwd: string, pathspec: string[]) {
  const git = (...args: string[]) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
    } catch {
      return ''; // not a git repo
    }
  };

  const people = new Map<string, { email: string; name: string; commits: number; activity: number; lines: number; last: number }>();
  for (const commit of git('log', '--no-merges', '--numstat', '--format=%x1e%an%x1f%ae%x1f%at', '--', ...pathspec).split('\x1e').slice(1)) {
    const [header, ...stats] = commit.trim().split('\n');
    const [name, email, at] = header.split('\x1f');
    if (name.toLowerCase().includes('[bot]')) continue;
    const size = stats.reduce((n, line) => n + (Number(line.split('\t')[0]) || 0) + (Number(line.split('\t')[1]) || 0), 0);
    const time = Number(at) * 1000;
    const key = email.trim().toLowerCase();
    const p = people.get(key) ?? { email: key, name, commits: 0, activity: 0, lines: 0, last: 0 };
    if (time >= p.last) Object.assign(p, { name, last: time }); // the latest name wins
    p.commits += 1;
    p.activity += 0.5 ** (Math.max(0, Date.now() - time) / 86_400_000 / 182) * Math.log2(2 + size);
    people.set(key, p);
  }

  for (const file of git('ls-files', '--', ...pathspec).split('\n').filter(Boolean)) {
    for (const line of git('blame', '--line-porcelain', '-w', '-M', '--', file).split('\n')) {
      const p = line.startsWith('author-mail <') && people.get(line.slice(13, -1).trim().toLowerCase());
      if (p) p.lines += 1; // bots are not in `people`
    }
  }

  const list = [...people.values()];
  const totalActivity = list.reduce((n, p) => n + p.activity, 0) || 1;
  const totalLines = list.reduce((n, p) => n + p.lines, 0) || 1;
  return list
    .map((p) => ({ ...p, score: 0.7 * (p.activity / totalActivity) + 0.3 * (p.lines / totalLines) }))
    .sort((a, b) => b.score - a.score || b.last - a.last);
}

export async function managerHead(head = '', options: any) {
  const { entries } = await (await options.presets.apply('storyIndexGenerator')).getIndex();
  const json = JSON.stringify(collectContributors(entries)).replace(/</g, '\\u003c');
  return `${head}\n<script>window.__COMPONENT_CONTRIBUTORS__ = ${json};</script>\n`;
}
