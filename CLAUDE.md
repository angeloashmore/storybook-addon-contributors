# Component Contributors

## Rules
- Never ship email addresses to the browser. Emails only group commits and feed the Gravatar hash.
- Say "worked on this", never "owner".
- Track the component a story shows, never the story file.
- This is a POC: cover the happy path and skip edge cases.

## Gotchas
- The addon has no build step. Storybook loads `packages/addon/*.ts(x)` from source, so keep the preset to erasable TypeScript and use `.ts` extensions in relative imports that Node loads.
- The manager bundle must not include its own React runtime. Storybook compiles manager TSX with classic `React.createElement`.
- `example/fixture` is a generated, gitignored git repo (`npm run fixture`). `example/expected.json` holds the expected answers, written from each scenario's intent and not from the addon's output.
- `npm test` needs Chromium: set `CHROMIUM_PATH` or run `npx playwright install chromium`. `npm run evals` needs `ANTHROPIC_API_KEY`.
