// Compares the addon's and an AI agent's answers with example/expected.json.
// Reports only; never fails hard.
//
//   ANTHROPIC_API_KEY=... pnpm evals        (optional: EVAL_MODEL, EVAL_RUNS, EVAL_CONCURRENCY)

import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { buildIndex } from 'storybook/internal/core-server';

import { collectContributors } from '../packages/addon/preset.ts';

const MODEL = process.env.EVAL_MODEL ?? 'claude-sonnet-5';
const RUNS = Number(process.env.EVAL_RUNS ?? 3);
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 3);
const EXAMPLE = new URL('../example/', import.meta.url).pathname;
const QUESTIONS = [
  (c: string) => `Who should I talk to about making a change to the ${c} component?`,
  (c: string) => `Who would be the best reviewer for a change to ${c}?`,
  (c: string) => `Who should I ask for an update on ${c}?`,
];

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY to run the evals.');
  process.exit(1);
}

// The addon's answers, from a fresh fixture and Storybook's real index.
execFileSync('node', [`${EXAMPLE}scripts/generate-fixture.mjs`], { stdio: 'inherit' });
process.chdir(EXAMPLE);
const addonData = collectContributors((await buildIndex({ configDir: `${EXAMPLE}.storybook` } as any)).entries);
const addonAnswer = (c: string) => addonData.components[`./fixture/src/${c}/${c}.stories.tsx`].contributors.map((p) => p.name);
const scenarios: { component: string; top: string[]; top3: string[] }[] = JSON.parse(readFileSync('expected.json', 'utf8')).scenarios;

// The agent works in a clone outside this repo, so it cannot find expected.json.
const repo = mkdtempSync(join(tmpdir(), 'contributors-eval-'));
execFileSync('git', ['clone', '-q', `${EXAMPLE}fixture`, repo]);
const authors = [...new Set(execFileSync('git', ['log', '--format=%an'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean))];
const inRepo = (p: unknown) => p === undefined || `${resolve(repo, String(p))}${sep}`.startsWith(repo + sep);
const readOnlyGit = /^git (log|show|blame|shortlog|ls-files|ls-tree|diff|grep|rev-list|status)\b[^;&|`$<>\n]*$/;

async function askAgent(question: string): Promise<{ people: string[]; reasoning: string }> {
  let text = '';
  for await (const msg of query({
    prompt: `${question} List up to three people, most relevant first.\n\nAnswer with JSON only: {"people": ["Name", ...], "reasoning": "..."}`,
    options: {
      cwd: repo,
      model: MODEL,
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
      settingSources: [],
      maxTurns: 30,
      canUseTool: async (tool, input) =>
        (tool === 'Bash' ? readOnlyGit.test(String(input.command).trim()) : inRepo(input.file_path) && inRepo(input.path))
          ? { behavior: 'allow', updatedInput: input }
          : { behavior: 'deny', message: 'Only file reading and read-only git commands are allowed.' },
    },
  })) {
    if (msg.type === 'result') text = msg.subtype === 'success' ? msg.result : '';
  }
  try {
    const { people, reasoning } = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    // Map "Priya", "Priya Patel <priya@...>" etc. to the git author name.
    const canonical = (s: string) => authors.find((a) => s.toLowerCase().includes(a.toLowerCase().split(' ')[0])) ?? s;
    return { people: people.map(canonical).slice(0, 3), reasoning };
  } catch {
    return { people: [], reasoning: `Unparseable answer: ${text}` };
  }
}

const top1 = (pred: string[], accepted: string[]) => Number(accepted.includes(pred[0]));
const overlap = (pred: string[], want: string[]) => want.filter((n) => pred.slice(0, 3).includes(n)).length / want.length;

const jobs = scenarios.flatMap((s) => QUESTIONS.flatMap((q, qi) => Array.from({ length: RUNS }, () => ({ s, q: qi + 1, question: q(s.component) }))));
const results: any[] = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let job; (job = jobs.shift()); ) {
      const { people: agent, reasoning } = await askAgent(job.question);
      const addon = addonAnswer(job.s.component).slice(0, 3);
      results.push({
        component: job.s.component,
        q: job.q,
        addon,
        agent,
        reasoning,
        'addon top1': top1(addon, job.s.top),
        'addon top3': overlap(addon, job.s.top3),
        'agent top1': top1(agent, job.s.top),
        'agent top3': overlap(agent, job.s.top3),
        'agree top1': Number(addon[0] === agent[0]),
        'agree top3': overlap(agent, addon),
      });
      console.log(`${results.length}: ${job.s.component} q${job.q} → ${agent.join(', ') || '(no answer)'}`);
    }
  }),
);

// One row per scenario × question, averaged over runs.
const avg = (rs: any[], k: string) => rs.reduce((sum, r) => sum + r[k], 0) / rs.length;
const table = scenarios.flatMap((s) =>
  QUESTIONS.map((_, qi) => {
    const rs = results.filter((r) => r.component === s.component && r.q === qi + 1);
    const metrics = ['addon top1', 'addon top3', 'agent top1', 'agent top3', 'agree top1', 'agree top3'];
    return { component: s.component, q: qi + 1, ...Object.fromEntries(metrics.map((k) => [k, `${Math.round(100 * avg(rs, k))}%`])) };
  }),
);
console.table(table);

const summary = {
  model: MODEL,
  runs: RUNS,
  addonMatchesExpected: avg(results, 'addon top1') === 1 && avg(results, 'addon top3') === 1,
  top1Agreement: avg(results, 'agree top1'),
};
console.log({ ...summary, targetMet: summary.addonMatchesExpected && summary.top1Agreement >= 0.8 });

mkdirSync(new URL('results/', import.meta.url), { recursive: true });
const file = new URL(`results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url).pathname;
writeFileSync(file, JSON.stringify({ summary, table, results }, null, 2));
console.log(`Results written to ${file}`);
