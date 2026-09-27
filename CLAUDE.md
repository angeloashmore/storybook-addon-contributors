# Component Contributors (Storybook addon POC)

## Purpose
A "Contributors" panel under each story that lists the people who have worked on the
component, so designers, PMs, QA and new engineers can find someone to ask, without git.

## Principles
- People first, stats second: names and faces lead; numbers are secondary text.
- Recent matters most: score = Σ 0.5^(ageDays / halfLifeDays) per commit (default half-life 182 days, addon option `halfLifeDays`). Show last-active date.
- Honest wording: "worked on this", never "owner".
- Zero setup for viewers.

## Constraints
- Local git only; git runs on the Node side at dev/build time. The static build works without the repo.
- Never ship emails to the browser (email is used only to group commits and for the Gravatar hash).
- Skip merge commits and names containing "[bot]".
- Component files: the story index `componentPath` if present, else the story file's folder.
- POC: no shallow clones, .mailmap, monorepo quirks or deployment handling.

## Layout
- `packages/addon`: the addon. `src/collect.ts` (git + ranking), `src/preset.ts` (managerHead injects data), `src/manager.tsx` (panel).
- `example`: Storybook (React + Vite) using the addon. `scripts/generate-fixture.mjs` builds `example/fixture`, a separate gitignored git repo with scripted history. `expected.json` holds the expected answers per scenario.
- `tests`: Vitest integration test (`integration.test.ts`) and Playwright e2e test (`e2e.test.ts`).
- `evals`: agent vs addon comparison (`run.ts`, Claude Agent SDK).

## Commands
- `pnpm install`
- `pnpm dev`: build the addon, generate the fixture, start Storybook on :6006
- `pnpm build`: the same, but builds a static Storybook to `example/storybook-static`
- `pnpm test`: integration + e2e (set `CHROMIUM_PATH` to use a preinstalled Chromium; otherwise run `npx playwright install chromium`)
- `pnpm evals`: needs `ANTHROPIC_API_KEY`; `EVAL_MODEL`, `EVAL_RUNS`, `EVAL_CONCURRENCY` are optional
