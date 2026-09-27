import { writeFileSync } from "node:fs";
import type { Reporter, TestModule } from "vitest/node";

import type { Trial } from "./it";

export default class EvalReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const trialsByEval: Record<string, Trial[]> = {};
    for (const testModule of testModules) {
      for (const test of testModule.children.allTests()) {
        const trial = test.meta().trial;
        if (trial) (trialsByEval[test.fullName] ??= []).push(trial);
      }
    }

    const allTrials = Object.values(trialsByEval).flat();
    if (allTrials.length === 0) return;

    const metrics = Object.keys(allTrials[0].scores);
    console.table(
      Object.entries(trialsByEval).map(([name, trials]) => ({
        eval: name,
        ...Object.fromEntries(
          metrics.map((metric) => [metric, `${Math.round(100 * average(trials, metric))}%`]),
        ),
      })),
    );

    const summary = {
      model: allTrials[0].model,
      trials: allTrials.length,
      addonMatchesExpected:
        average(allTrials, "addon top1") === 1 && average(allTrials, "addon top3") === 1,
      topOneAgreement: average(allTrials, "agree top1"),
    };
    console.log({
      ...summary,
      targetMet: summary.addonMatchesExpected && summary.topOneAgreement >= 0.8,
    });

    const results = JSON.stringify({ summary, evals: trialsByEval }, null, 2);
    writeFileSync(new URL("results.json", import.meta.url), `${results}\n`);
  }
}

function average(trials: Trial[], metric: string): number {
  return trials.reduce((total, trial) => total + trial.scores[metric], 0) / trials.length;
}
