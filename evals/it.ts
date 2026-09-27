import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { buildIndex } from 'storybook/internal/core-server';
import { test } from 'vitest';

import { collectContributors } from '../packages/addon/preset';
import { EXAMPLE } from '../tests/shared';

if (!process.env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY to run the evals.');

export const MODEL = process.env.EVAL_MODEL ?? 'claude-sonnet-5';
export const trials = Array.from({ length: Number(process.env.EVAL_TRIALS ?? 3) }, (_, i) => i + 1);

// The addon's answers, from a fresh fixture and Storybook's real index.
execFileSync('node', [`${EXAMPLE}scripts/generate-fixture.mjs`]);
process.chdir(EXAMPLE);
const { components } = collectContributors((await buildIndex({ configDir: `${EXAMPLE}.storybook` } as any)).entries);
export const addonAnswer = (c: string) =>
  components[`./fixture/src/${c}/${c}.stories.tsx`].contributors.map((p) => p.name).slice(0, 3);

// The agent works in a clone outside this repo, so it cannot find expected.json.
const repo = mkdtempSync(join(tmpdir(), 'contributors-eval-'));
execFileSync('git', ['clone', '-q', `${EXAMPLE}fixture`, repo]);
export const authors = [...new Set(execFileSync('git', ['log', '--format=%an'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean))];
const inRepo = (p: unknown) => p === undefined || `${resolve(repo, String(p))}${sep}`.startsWith(repo + sep);
const readOnlyGit = /^git (log|show|blame|shortlog|ls-files|ls-tree|diff|grep|rev-list|status)\b[^;&|`$<>\n]*$/;

/** Recorded per trial for the reporter. */
export type Trial = { model: string; addon: string[]; agent: string[]; reasoning: string; scores: Record<string, number> };

declare module 'vitest' {
  interface TaskMeta {
    trial?: Trial;
  }
}

export const it = test.extend<{ agent: (prompt: string) => Promise<{ people: string[]; reasoning: string }> }>({
  agent: async ({}, use) => {
    await use(async (prompt) => {
      for await (const msg of query({
        prompt: `${prompt} List up to three people, most relevant first.`,
        options: {
          cwd: repo,
          model: MODEL,
          tools: ['Read', 'Grep', 'Glob', 'Bash'],
          settingSources: [],
          persistSession: false,
          canUseTool: async (tool, input) =>
            (tool === 'Bash' ? readOnlyGit.test(String(input.command).trim()) : inRepo(input.file_path) && inRepo(input.path))
              ? { behavior: 'allow', updatedInput: input }
              : { behavior: 'deny', message: 'Only file reading and read-only git commands are allowed.' },
          outputFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: { people: { type: 'array', items: { type: 'string' } }, reasoning: { type: 'string' } },
              required: ['people', 'reasoning'],
              additionalProperties: false,
            },
          },
        },
      })) {
        if (msg.type !== 'result') continue;
        if (msg.subtype !== 'success') throw new Error(`Agent run failed (${msg.subtype})`);
        return msg.structured_output as { people: string[]; reasoning: string };
      }
      throw new Error('Agent run failed (no result message)');
    });
  },
});
