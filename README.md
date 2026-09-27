# Component Contributors

A Storybook 10 addon (React + Vite) that adds a **Contributors** panel. It lists the people who
have worked on the current story's component, most relevant first. The data comes from local git
history at dev/build time, so the static Storybook works without the repo or any accounts.

```ts
// .storybook/main.ts
addons: [{ name: 'storybook-addon-component-contributors', options: { halfLifeDays: 182 } }]
```

Each commit counts 0.5^(age / half-life). Merge commits and `[bot]` authors are skipped.
Emails never reach the browser; only a SHA-256 hash for Gravatar does, and a guessable email can
still be matched to its hash.

Run `pnpm install`, then `pnpm dev`, `pnpm build`, `pnpm test` or `pnpm evals`. See CLAUDE.md for details.
