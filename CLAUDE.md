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
- `packages/addon`: the addon, loaded from source with no build step.
  - `preset.ts`: Node side. Runs git, ranks people, and injects the data into the manager via `managerHead`.
  - `manager.tsx`: the panel.
- `example`: Storybook (React + Vite) using the addon. `scripts/generate-fixture.mjs` builds `example/fixture`, a separate gitignored git repo with scripted history. `expected.json` holds the expected answers per scenario, written from intent.
- `tests`: Vitest integration test (collector on Storybook's real index) and e2e test (static build + Playwright).
- `evals/run.ts`: addon vs agent comparison (Claude Agent SDK, read-only tools, run in a temp clone).

## Commands
- `pnpm install`
- `pnpm dev`: generate the fixture and start Storybook on :6006
- `pnpm build`: generate the fixture and build static Storybook to `example/storybook-static`
- `pnpm test`: integration + e2e. Set `CHROMIUM_PATH` to use a preinstalled Chromium; otherwise run `npx playwright install chromium`.
- `pnpm typecheck`
- `pnpm evals`: needs `ANTHROPIC_API_KEY`. `EVAL_MODEL`, `EVAL_RUNS` (default 3) and `EVAL_CONCURRENCY` are optional. Results go to `evals/results/`.

## Gotchas
- The addon is TypeScript loaded directly (Node type stripping for the preset, Storybook's esbuild for the manager). Keep to erasable TS syntax and use `.ts` extensions in relative imports that Node loads.
- The manager bundle must not include its own React runtime; Storybook compiles manager TSX with classic `React.createElement`.
