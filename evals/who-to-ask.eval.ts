import { describe } from 'vitest';

import { scenarios } from '../tests/shared';
import { MODEL, addonAnswer, authors, it, trials } from './it';

const questions = [
  { name: 'change', ask: (c: string) => `Who should I talk to about making a change to the ${c} component?` },
  { name: 'review', ask: (c: string) => `Who would be the best reviewer for a change to ${c}?` },
  { name: 'update', ask: (c: string) => `Who should I ask for an update on ${c}?` },
];

const top1 = (pred: string[], accepted: string[]) => Number(accepted.includes(pred[0]));
const overlap = (pred: string[], want: string[]) => want.filter((n) => pred.slice(0, 3).includes(n)).length / want.length;
// Map "Priya", "Priya Patel <priya@...>" etc. to the git author name.
const canonical = (s: string) => authors.find((a) => s.toLowerCase().includes(a.toLowerCase().split(' ')[0])) ?? s;

describe.for(scenarios)('$component ($scenario)', (s) => {
  describe.for(questions)('$name', (q) => {
    it.for(trials)('names the expected person first', async (_, { agent, task, expect }) => {
      const answer = await agent(q.ask(s.component));
      const people = answer.people.map(canonical).slice(0, 3);
      const addon = addonAnswer(s.component);
      task.meta.trial = {
        model: MODEL,
        addon,
        agent: people,
        reasoning: answer.reasoning,
        scores: {
          'addon top1': top1(addon, s.top),
          'addon top3': overlap(addon, s.top3),
          'agent top1': top1(people, s.top),
          'agent top3': overlap(people, s.top3),
          'agree top1': Number(addon[0] === people[0]),
          'agree top3': overlap(people, addon),
        },
      };
      expect(s.top).toContain(people[0]);
    });
  });
});
