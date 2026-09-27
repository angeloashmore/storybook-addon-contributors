# Component Contributors

A Storybook addon (Storybook 10, React + Vite) that adds a **Contributors** panel. For the
component behind the current story, it lists the people who have worked on it, most
relevant first, with avatars, commit counts and last-active dates. The data comes from
local git history at dev/build time, so the static Storybook works without the repo and
viewers need no accounts.

```ts
// .storybook/main.ts
addons: [{ name: 'storybook-addon-component-contributors', options: { halfLifeDays: 182 } }]
```

Ranking: each commit counts 0.5^(age / half-life). Merge commits and `[bot]` authors are
skipped. Emails never reach the browser. Only a SHA-256 hash is sent, for Gravatar.
Note that a hash of a guessable email can still be matched by someone who guesses it.

```sh
pnpm install
pnpm dev     # fixture repo + Storybook on :6006
pnpm build   # static build in example/storybook-static
pnpm test    # integration + e2e (CHROMIUM_PATH=... to reuse a browser)
pnpm evals   # addon vs agent (needs ANTHROPIC_API_KEY)
```

See CLAUDE.md for the layout and the design principles.
