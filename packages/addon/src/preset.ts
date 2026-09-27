// Node-side preset. Runs git at dev/build time and embeds the results in the
// manager page, so the static build works without the repo.

import type { Options } from 'storybook/internal/types';

import { collectContributors, type IndexEntryLike } from './collect';
import { DATA_GLOBAL } from './constants';
import type { AddonOptions } from './types';

interface StoryIndexGenerator {
  getIndex(): Promise<{ entries: Record<string, IndexEntryLike> }>;
}

export const managerHead = async (head: string | undefined, options: Options & AddonOptions) => {
  // Same generator Storybook uses for index.json; it is created once and cached.
  const generator = await options.presets.apply<StoryIndexGenerator | undefined>('storyIndexGenerator');
  if (!generator) return head ?? '';
  const index = await generator.getIndex();
  const data = collectContributors(index.entries, {
    halfLifeDays: options.halfLifeDays,
    limit: options.limit ?? 10,
  });
  // Escape "<" so the JSON cannot close the script tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `${head ?? ''}\n<script>window.${DATA_GLOBAL} = ${json};</script>\n`;
};
