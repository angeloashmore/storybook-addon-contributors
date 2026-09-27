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
- Track what the story shows, not the story: the index `componentPath` if present, else the story's folder excluding `*.stories.*` files.
- POC: no shallow clones, .mailmap, monorepo quirks or deployment handling.

## Layout
- `packages/addon`: the addon, loaded from source with no build step.
  - `preset.ts`: Node side. Runs git, ranks people, and injects the data into the manager via `managerHead`.
  - `manager.tsx`: the panel.
- `example`: Storybook (React + Vite) using the addon. `scripts/generate-fixture.mjs` builds `example/fixture`, a separate gitignored git repo with scripted history. `expected.json` holds the expected answers per scenario, written from intent.
- `tests`: Vitest integration test (collector on Storybook's real index) and e2e test (static build + Playwright).
- `evals`: agent evals in the style of prismicio/cli. `it.ts` is the harness: an `agent` fixture that runs Claude Code with read-only tools in a temp clone of the fixture. `*.eval.ts` holds the evals. `reporter.ts` prints the table and writes `results.json`, which is committed so history lives in git.
- `docs/screenshot.png`: README screenshot (the Card story in the static build).

## Commands
- `npm install`
- `npm run dev`: generate the fixture and start Storybook on :6006
- `npm run build`: generate the fixture and build static Storybook to `example/storybook-static`
- `npm test`: integration + e2e. Set `CHROMIUM_PATH` to use a preinstalled Chromium; otherwise run `npx playwright install chromium`.
- `npm run typecheck`
- `npm run evals`: Vitest `evals` project; needs `ANTHROPIC_API_KEY`. `EVAL_MODEL` (default `claude-sonnet-5`) and `EVAL_TRIALS` (default 3) are optional. Each trial passes when the agent names an expected person first; the table also scores addon vs expected and addon vs agent.

## Gotchas
- The addon is TypeScript loaded directly (Node type stripping for the preset, Storybook's esbuild for the manager). Keep to erasable TS syntax and use `.ts` extensions in relative imports that Node loads.
- The manager bundle must not include its own React runtime; Storybook compiles manager TSX with classic `React.createElement`.
