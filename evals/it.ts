import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildIndex } from "storybook/internal/core-server";
import { test } from "vitest";

import { collectContributors } from "../src/preset";
import { EXAMPLE_DIR, storyImportPath } from "../tests/shared";

export const MODEL = process.env.EVAL_MODEL ?? "claude-sonnet-5";
const TRIAL_COUNT = Number(process.env.EVAL_TRIALS ?? 3);
export const trials = Array.from({ length: TRIAL_COUNT }, (_, index) => index + 1);

export type Trial = {
  model: string;
  addon: string[];
  agent: string[];
  reasoning: string;
  scores: Record<string, number>;
};

type AgentAnswer = { people: string[]; reasoning: string };

declare module "vitest" {
  interface TaskMeta {
    trial?: Trial;
  }
}

execFileSync("node", [`${EXAMPLE_DIR}scripts/generate-fixture.mjs`]);
process.chdir(EXAMPLE_DIR);
const index = await buildIndex({ configDir: `${EXAMPLE_DIR}.storybook` } as any);
const { components } = collectContributors(index.entries);

export function addonAnswer(component: string): string[] {
  return components[storyImportPath(component)].contributors
    .map((contributor) => contributor.name)
    .slice(0, 3);
}

// A clone outside this repo, so the agent cannot read expected.json.
const agentRepo = mkdtempSync(join(tmpdir(), "contributors-eval-"));
execFileSync("git", ["clone", "-q", `${EXAMPLE_DIR}fixture`, agentRepo]);

const authorLog = execFileSync("git", ["log", "--format=%an"], {
  cwd: agentRepo,
  encoding: "utf8",
});
export const authors = [...new Set(authorLog.split("\n").filter(Boolean))];

const READ_ONLY_GIT_COMMAND =
  /^git (log|show|blame|shortlog|ls-files|ls-tree|diff|grep|rev-list|status)\b[^;&|`$<>\n]*$/;

function isInsideAgentRepo(path: unknown): boolean {
  if (path === undefined) return true;
  return `${resolve(agentRepo, String(path))}${sep}`.startsWith(agentRepo + sep);
}

function isAllowed(tool: string, input: Record<string, unknown>): boolean {
  if (tool === "Bash") return READ_ONLY_GIT_COMMAND.test(String(input.command).trim());
  return isInsideAgentRepo(input.file_path) && isInsideAgentRepo(input.path);
}

async function askAgent(prompt: string): Promise<AgentAnswer> {
  const messages = query({
    prompt: `${prompt} List up to three people, most relevant first.`,
    options: {
      cwd: agentRepo,
      model: MODEL,
      tools: ["Read", "Grep", "Glob", "Bash"],
      settingSources: [],
      persistSession: false,
      canUseTool: async (tool, input) =>
        isAllowed(tool, input)
          ? { behavior: "allow", updatedInput: input }
          : {
              behavior: "deny",
              message: "Only file reading and read-only git commands are allowed.",
            },
      outputFormat: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            people: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
          },
          required: ["people", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  });

  for await (const message of messages) {
    if (message.type !== "result") continue;
    if (message.subtype !== "success") throw new Error(`Agent run failed (${message.subtype})`);
    return message.structured_output as AgentAnswer;
  }
  throw new Error("Agent run failed (no result message)");
}

export const it = test.extend<{ agent: (prompt: string) => Promise<AgentAnswer> }>({
  // oxlint-disable-next-line no-empty-pattern -- Vitest fixtures must destructure their first argument.
  agent: async ({}, use) => {
    await use(askAgent);
  },
});
