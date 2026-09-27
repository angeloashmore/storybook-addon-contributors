import { writeFileSync } from 'node:fs';
import type { Reporter, TestModule } from 'vitest/node';

import type { Trial } from './it';

// Prints one row per scenario × question, averaged over trials, and writes every
// trial (with the agent's reasoning) to results.json; history lives in git.
export default class EvalReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const evals: Record<string, Trial[]> = {};
    for (const test of testModules.flatMap((m) => [...m.children.allTests()])) {
      const trial = test.meta().trial;
      if (trial) (evals[test.fullName] ??= []).push(trial);
    }
    const all = Object.values(evals).flat();
    if (!all.length) return;

    const avg = (trials: Trial[], k: string) => trials.reduce((sum, t) => sum + t.scores[k], 0) / trials.length;
    const metrics = Object.keys(all[0].scores);
    console.table(
      Object.entries(evals).map(([name, trials]) => ({
        eval: name,
        ...Object.fromEntries(metrics.map((k) => [k, `${Math.round(100 * avg(trials, k))}%`])),
      })),
    );
    const summary = {
      model: all[0].model,
      trials: all.length,
      addonMatchesExpected: avg(all, 'addon top1') === 1 && avg(all, 'addon top3') === 1,
      top1Agreement: avg(all, 'agree top1'),
    };
    console.log({ ...summary, targetMet: summary.addonMatchesExpected && summary.top1Agreement >= 0.8 });
    writeFileSync(new URL('results.json', import.meta.url), JSON.stringify({ summary, evals }, null, 2) + '\n');
  }
}
