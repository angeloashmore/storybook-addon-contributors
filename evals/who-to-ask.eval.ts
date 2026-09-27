import { describe } from "vitest";

import { scenarios } from "../tests/shared";
import { MODEL, addonAnswer, authors, it, trials } from "./it";

const questions = [
  {
    name: "change",
    ask: (component: string) =>
      `Who should I talk to about making a change to the ${component} component?`,
  },
  {
    name: "review",
    ask: (component: string) => `Who would be the best reviewer for a change to ${component}?`,
  },
  { name: "update", ask: (component: string) => `Who should I ask for an update on ${component}?` },
];

function topOneMatches(ranked: string[], accepted: string[]): number {
  return accepted.includes(ranked[0]) ? 1 : 0;
}

function topThreeOverlap(ranked: string[], wanted: string[]): number {
  const topThree = ranked.slice(0, 3);
  return wanted.filter((name) => topThree.includes(name)).length / wanted.length;
}

function toAuthorName(answer: string): string {
  const lowerAnswer = answer.toLowerCase();
  const firstName = (author: string) => author.toLowerCase().split(" ")[0];
  return authors.find((author) => lowerAnswer.includes(firstName(author))) ?? answer;
}

describe.for(scenarios)("$component ($scenario)", (scenario) => {
  describe.for(questions)("$name", (question) => {
    it.for(trials)("names the expected person first", async (_, { agent, task, expect }) => {
      const answer = await agent(question.ask(scenario.component));
      const agentPeople = answer.people.map(toAuthorName).slice(0, 3);
      const addonPeople = addonAnswer(scenario.component);

      task.meta.trial = {
        model: MODEL,
        addon: addonPeople,
        agent: agentPeople,
        reasoning: answer.reasoning,
        scores: {
          "addon top1": topOneMatches(addonPeople, scenario.top),
          "addon top3": topThreeOverlap(addonPeople, scenario.top3),
          "agent top1": topOneMatches(agentPeople, scenario.top),
          "agent top3": topThreeOverlap(agentPeople, scenario.top3),
          "agree top1": addonPeople[0] === agentPeople[0] ? 1 : 0,
          "agree top3": topThreeOverlap(agentPeople, addonPeople),
        },
      };

      expect(scenario.top).toContain(agentPeople[0]);
    });
  });
});
