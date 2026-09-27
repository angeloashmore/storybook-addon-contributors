// Compares the addon's answers and an AI agent's answers against
// example/expected.json. Reports; never fails hard.
//
//   ANTHROPIC_API_KEY=... pnpm evals
//   EVAL_MODEL=claude-sonnet-5 EVAL_RUNS=3 EVAL_CONCURRENCY=3 pnpm evals

import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from 'storybook/internal/core-server';
import { collectContributors } from 'storybook-addon-component-contributors';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = join(ROOT, 'example');
const MODEL = process.env.EVAL_MODEL ?? 'claude-sonnet-5';
const RUNS = Number(process.env.EVAL_RUNS ?? 3);
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 3);

const QUESTIONS = [
  (c: string) => `Who should I talk to about making a change to the ${c} component? List up to three people, most relevant first.`,
  (c: string) => `Who would be the best reviewer for a change to ${c}? List up to three people, most relevant first.`,
  (c: string) => `Who should I ask for an update on ${c}? List up to three people, most relevant first.`,
];

interface Scenario {
  component: string;
  scenario: string;
  top: string[];
  top3: string[];
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Export it and run again.');
  process.exit(1);
}

// 1. Fresh fixture, then the addon's answers from Storybook's real index.
execFileSync('node', [join(EXAMPLE, 'scripts/generate-fixture.mjs')], { stdio: 'inherit' });
process.chdir(EXAMPLE);
const index = await buildIndex({ configDir: join(EXAMPLE, '.storybook') } as any);
const addonData = collectContributors(index.entries as any, { cwd: EXAMPLE });
const scenarios: Scenario[] = JSON.parse(readFileSync(join(EXAMPLE, 'expected.json'), 'utf8')).scenarios;
const addonAnswer = (c: string) =>
  addonData.components[`./fixture/src/${c}/${c}.stories.tsx`].contributors.map((p) => p.name);

// 2. The agent works on a clone outside this repo, so it cannot see expected.json.
const repo = mkdtempSync(join(tmpdir(), 'contributors-eval-'));
execFileSync('git', ['clone', '-q', join(EXAMPLE, 'fixture'), repo]);
const people = [...new Set(execFileSync('git', ['log', '--format=%an'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean))];

const inRepo = (p: unknown) => typeof p !== 'string' || resolve(repo, p) === repo || resolve(repo, p).startsWith(repo + sep);
const READ_ONLY_GIT = /^git (log|show|blame|shortlog|ls-files|diff|status|rev-list|rev-parse|grep|ls-tree|cat-file)\b[^;&|`$<>\n]*$/;

async function askAgent(question: string) {
  let text = '';
  for await (const msg of query({
    prompt: `${question}\n\nAnswer with JSON only, in this exact shape: {"people": ["Name", ...], "reasoning": "..."}`,
    options: {
      cwd: repo,
      model: MODEL,
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
      settingSources: [],
      maxTurns: 30,
      canUseTool: async (tool, input) => {
        const ok =
          tool === 'Bash'
            ? READ_ONLY_GIT.test(String(input.command).trim())
            : ['Read', 'Grep', 'Glob'].includes(tool) && inRepo(input.file_path) && inRepo(input.path);
        return ok ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'Only file reading and read-only git commands are allowed.' };
      },
    },
  })) {
    if (msg.type === 'result') text = msg.subtype === 'success' ? msg.result : `ERROR: ${msg.subtype}`;
  }
  try {
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return { people: (parsed.people as string[]).map(canonical), reasoning: String(parsed.reasoning ?? ''), raw: text };
  } catch {
    return { people: [] as string[], reasoning: '', raw: text };
  }
}

// Map "Priya Patel <priya@...>" or "Priya" to the git author name.
function canonical(answer: string) {
  const a = answer.toLowerCase();
  return people.find((p) => a.includes(p.toLowerCase())) ?? people.find((p) => a.includes(p.split(' ')[0].toLowerCase())) ?? answer;
}

const top1 = (pred: string[], accepted: string[]) => accepted.includes(pred[0]);
const overlap = (pred: string[], want: string[]) =>
  want.length ? want.filter((n) => pred.slice(0, 3).includes(n)).length / want.length : 1;

// 3. Run every scenario × question × run, a few at a time.
const jobs = scenarios.flatMap((s) => QUESTIONS.flatMap((q, qi) => Array.from({ length: RUNS }, (_, run) => ({ s, qi, run, question: q(s.component) }))));
const results: any[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const agent = await askAgent(job.question);
      const addon = addonAnswer(job.s.component);
      results.push({
        component: job.s.component,
        scenario: job.s.scenario,
        question: job.qi + 1,
        run: job.run + 1,
        addon: addon.slice(0, 3),
        agent: agent.people.slice(0, 3),
        reasoning: agent.reasoning,
        raw: agent.reasoning ? undefined : agent.raw,
        addonTop1: top1(addon, job.s.top),
        addonTop3: overlap(addon, job.s.top3),
        agentTop1: top1(agent.people, job.s.top),
        agentTop3: overlap(agent.people, job.s.top3),
        agreeTop1: addon[0] === agent.people[0],
        agreeTop3: overlap(agent.people, addon.slice(0, 3)),
      });
      console.log(`done ${results.length}/${jobs.length}: ${job.s.component} q${job.qi + 1} run ${job.run + 1} → ${agent.people.join(', ') || '(no answer)'}`);
    }
  }),
);

// 4. Report.
const pct = (xs: number[]) => `${Math.round((100 * xs.reduce((a, b) => a + b, 0)) / (xs.length || 1))}%`;
const rows = scenarios.flatMap((s) =>
  QUESTIONS.map((_, qi) => {
    const rs = results.filter((r) => r.component === s.component && r.question === qi + 1);
    const n = (k: string) => rs.map((r) => Number(r[k]));
    return {
      component: s.component,
      q: qi + 1,
      'addon top1': pct(n('addonTop1')),
      'addon top3': pct(n('addonTop3')),
      'agent top1': pct(n('agentTop1')),
      'agent top3': pct(n('agentTop3')),
      'agree top1': pct(n('agreeTop1')),
      'agree top3': pct(n('agreeTop3')),
    };
  }),
);
console.table(rows);

const addonAllCorrect = scenarios.every((s) => top1(addonAnswer(s.component), s.top) && overlap(addonAnswer(s.component), s.top3) === 1);
const agreement = results.filter((r) => r.agreeTop1).length / (results.length || 1);
const summary = {
  model: MODEL,
  runs: RUNS,
  addonMatchesExpectedOnEveryScenario: addonAllCorrect,
  addonAgentTop1Agreement: agreement,
  targetMet: addonAllCorrect && agreement >= 0.8,
};
console.log(summary);

mkdirSync(join(ROOT, 'evals/results'), { recursive: true });
const file = join(ROOT, 'evals/results', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ summary, table: rows, results }, null, 2));
console.log(`Results written to ${file}`);
