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
  { halfLifeDays = 182 } = {},
): ContributorsData {
  const components: ContributorsData['components'] = {};
  for (const { type, importPath, componentPath } of Object.values(entries)) {
    if (type !== 'story' || components[importPath]) continue;
    // Track what the story shows, not the story: the component file, or the
    // story's folder minus story files when the index has no componentPath.
    const target = componentPath ? resolve(componentPath) : dirname(resolve(importPath));
    const pathspec = componentPath ? [target] : [target, ':(exclude,glob)**/*.stories.*'];
    const people = new Map<string, { name: string; commits: number; score: number; last: number }>();

    let log = '';
    try {
      log = execFileSync('git', ['log', '--no-merges', '--format=%an%x1f%ae%x1f%at', '--', ...pathspec], {
        cwd: dirname(target),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {} // not a git repo: no contributors

    for (const [name, email, at] of log.split('\n').filter(Boolean).map((line) => line.split('\x1f'))) {
      if (name.toLowerCase().includes('[bot]')) continue;
      const time = Number(at) * 1000;
      const key = email.trim().toLowerCase();
      const p = people.get(key) ?? { name, commits: 0, score: 0, last: 0 };
      if (time >= p.last) Object.assign(p, { name, last: time }); // the latest name wins
      p.commits += 1;
      p.score += 0.5 ** (Math.max(0, Date.now() - time) / 86_400_000 / halfLifeDays);
      people.set(key, p);
    }

    components[importPath] = {
      files: [relative(process.cwd(), target)],
      contributors: [...people]
        .sort(([, a], [, b]) => b.score - a.score || b.last - a.last)
        .slice(0, 10)
        .map(([email, { name, commits, score, last }]) => ({
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

export async function managerHead(head = '', options: any) {
  const { entries } = await (await options.presets.apply('storyIndexGenerator')).getIndex();
  const json = JSON.stringify(collectContributors(entries, options)).replace(/</g, '\\u003c');
  return `${head}\n<script>window.__COMPONENT_CONTRIBUTORS__ = ${json};</script>\n`;
}
